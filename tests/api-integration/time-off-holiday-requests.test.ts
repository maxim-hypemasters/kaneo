import { and, eq, like } from "drizzle-orm";
import type { WSContext } from "hono/ws";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { addUserConnection, removeUserConnection } from "../../apps/api/src/ws";
import { createInstanceAdmin } from "./helpers/admin/create-instance-admin";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertTask } from "./helpers/release/insert-task";
import { addDays, setMemberRole } from "./helpers/time-off";
import { currentYear, todayUtc } from "./helpers/time-off-days";
import {
  type Caller,
  callerFor,
  createTimeOffTeam,
  type TimeOffTeam,
} from "./helpers/time-off-team";

// Every published event, recorded before the real handlers run to the end.
const published = vi.hoisted(
  () => [] as Array<{ event: string; data: unknown }>,
);
vi.mock("../../apps/api/src/events", async (original) => {
  const { awaitEventHandlers } = await import("./helpers/await-event-handlers");
  const events = await awaitEventHandlers(original);
  return {
    ...events,
    publishEvent: async (event: string, data: unknown) => {
      published.push({ event, data });
      await events.publishEvent(event, data);
    },
  };
});

const sockets: Array<{
  userId: string;
  connection: ReturnType<typeof addUserConnection>;
}> = [];

beforeEach(async () => {
  await resetTestDatabase();
  published.length = 0;
});

afterEach(() => {
  for (const { userId, connection } of sockets.splice(0))
    removeUserConnection(userId, connection);
});

const NEXT = currentYear() + 1;
const DE_BY = { country: "DE", region: "BY" };
const FR = { country: "FR", region: null };

type CalendarResult = {
  status: "applied" | "pending";
  calendar: { country: string; region: string | null } | null;
  pendingRequest: CalendarRequest | null;
};
type CalendarRequest = {
  id: string;
  userId: string;
  status: string;
  version: number;
  calendar: { country: string; region: string | null } | null;
  createdAt: string;
  updatedAt: string;
};

// Sets (a calendar) or clears (null) a calendar, for `userId` when given.
async function choose(
  caller: Caller,
  team: TimeOffTeam,
  calendar: { country: string; region?: string | null } | null,
  userId?: string,
): Promise<CalendarResult> {
  const path = `/workspace/${team.workspaceId}/holiday-calendar`;
  const response = calendar
    ? await caller(path, "PUT", { ...calendar, ...(userId ? { userId } : {}) })
    : await caller(`${path}${userId ? `?userId=${userId}` : ""}`, "DELETE");
  expect(response.status).toBe(200);
  return response.json();
}

async function holidays(caller: Caller, team: TimeOffTeam, userId?: string) {
  const query = `year=${NEXT}${userId ? `&userId=${userId}` : ""}`;
  const response = await caller(
    `/workspace/${team.workspaceId}/holidays?${query}`,
  );
  expect(response.status).toBe(200);
  return response.json();
}

const requestPath = (team: TimeOffTeam, id: string, action: string) =>
  `/workspace/${team.workspaceId}/holiday-calendar-requests/${id}/${action}`;

function decide(
  caller: Caller,
  team: TimeOffTeam,
  request: { id: string; version: number },
  action: "approve" | "decline",
) {
  return caller(requestPath(team, request.id, action), "POST", {
    version: request.version,
  });
}

async function setDeadline(team: TimeOffTeam, deadline: string | null) {
  const response = await team.as(team.owner)(
    `/workspace/${team.workspaceId}/settings`,
    "PUT",
    { holidayCalendarDeadline: deadline },
  );
  expect(response.status).toBe(200);
}

async function storedCalendar(team: TimeOffTeam, userId: string) {
  const [row] = await db
    .select({
      country: schema.timeOffHolidayCalendarTable.country,
      region: schema.timeOffHolidayCalendarTable.region,
    })
    .from(schema.timeOffHolidayCalendarTable)
    .where(
      and(
        eq(schema.timeOffHolidayCalendarTable.workspaceId, team.workspaceId),
        eq(schema.timeOffHolidayCalendarTable.userId, userId),
      ),
    );
  return row ?? null;
}

async function requestStatuses(userId: string) {
  return (
    await db
      .select({ status: schema.timeOffHolidayCalendarRequestTable.status })
      .from(schema.timeOffHolidayCalendarRequestTable)
      .where(eq(schema.timeOffHolidayCalendarRequestTable.userId, userId))
  ).map((row) => row.status);
}

// The member's holiday dates in January next year, as the team sees them.
async function teamCalendarDays(team: TimeOffTeam) {
  const response = await team.as(team.colleague)(
    `/workspace/${team.workspaceId}?from=${NEXT}-01-01&to=${NEXT}-01-31`,
  );
  expect(response.status).toBe(200);
  const { holidays } = (await response.json()) as {
    holidays: Array<{ userId: string; date: string }>;
  };
  return holidays
    .filter((holiday) => holiday.userId === team.member.id)
    .map((holiday) => holiday.date);
}

describe("a member's free first choice", () => {
  it("applies the first choice and sends later changes for approval", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);

    const first = await choose(member, team, DE_BY);
    expect(first).toMatchObject({
      status: "applied",
      calendar: DE_BY,
      pendingRequest: null,
    });
    expect(await teamCalendarDays(team)).toContain(`${NEXT}-01-06`);

    const second = await choose(member, team, FR);
    expect(second).toMatchObject({
      status: "pending",
      calendar: DE_BY,
      pendingRequest: {
        userId: team.member.id,
        status: "pending",
        version: 0,
        calendar: { ...FR, countryName: "France" },
      },
    });
    expect(await holidays(member, team)).toMatchObject({
      calendar: DE_BY,
      calendarChosen: true,
      pendingRequest: { id: second.pendingRequest?.id, calendar: FR },
      holidayCalendarDeadline: null,
      nextChangeNeedsApproval: true,
    });
    // A pending change moves nothing on the team calendar.
    expect(await teamCalendarDays(team)).toContain(`${NEXT}-01-06`);
    expect(await storedCalendar(team, team.member.id)).toEqual(DE_BY);
  });

  it("starts without a choice and says the first one is free", async () => {
    const team = await createTimeOffTeam();
    expect(await holidays(team.as(team.member), team)).toMatchObject({
      calendar: null,
      calendarChosen: false,
      pendingRequest: null,
      holidayCalendarDeadline: null,
      nextChangeNeedsApproval: false,
    });
  });

  it("records an explicit No calendar as the choice", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    await setDeadline(team, addDays(todayUtc(), 7));

    expect(await choose(member, team, null)).toEqual({
      workspaceId: team.workspaceId,
      userId: team.member.id,
      status: "applied",
      calendar: null,
      pendingRequest: null,
    });
    expect(await storedCalendar(team, team.member.id)).toEqual({
      country: null,
      region: null,
    });
    // The reminder's inputs: the choice is made and nothing waits.
    expect(await holidays(member, team)).toMatchObject({
      calendar: null,
      calendarChosen: true,
      pendingRequest: null,
      holidays: [],
      nextChangeNeedsApproval: true,
    });
    expect(await teamCalendarDays(team)).toEqual([]);
    expect((await choose(member, team, DE_BY)).status).toBe("pending");
  });
});

describe("the holiday calendar deadline", () => {
  it("applies a first choice on the deadline day", async () => {
    const team = await createTimeOffTeam();
    await setDeadline(team, todayUtc());
    const member = team.as(team.member);
    expect(await holidays(member, team)).toMatchObject({
      holidayCalendarDeadline: todayUtc(),
      nextChangeNeedsApproval: false,
    });
    expect((await choose(member, team, DE_BY)).status).toBe("applied");
  });

  it("sends even a first choice for approval after the deadline", async () => {
    const team = await createTimeOffTeam();
    await setDeadline(team, addDays(todayUtc(), -1));
    const member = team.as(team.member);
    expect(await holidays(member, team)).toMatchObject({
      calendarChosen: false,
      nextChangeNeedsApproval: true,
    });

    const result = await choose(member, team, DE_BY);
    expect(result).toMatchObject({
      status: "pending",
      calendar: null,
      pendingRequest: { calendar: DE_BY },
    });
    expect(await storedCalendar(team, team.member.id)).toBeNull();

    // Without a deadline the colleague's first choice is free again.
    await setDeadline(team, null);
    expect((await choose(team.as(team.colleague), team, FR)).status).toBe(
      "applied",
    );
  });
});

describe("deciding a calendar request", () => {
  it("approves a request to clear the calendar, keeping a No calendar row", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    await choose(member, team, DE_BY);

    const cleared = await choose(member, team, null);
    expect(cleared).toMatchObject({
      status: "pending",
      calendar: DE_BY,
      pendingRequest: { calendar: null, version: 0 },
    });
    const request = cleared.pendingRequest!;
    const approved = await decide(
      team.as(team.admin),
      team,
      request,
      "approve",
    );
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({
      id: request.id,
      status: "approved",
      calendar: null,
      // A decision is not a change by the member.
      updatedAt: request.updatedAt,
    });
    expect(await storedCalendar(team, team.member.id)).toEqual({
      country: null,
      region: null,
    });
    expect(await holidays(member, team)).toMatchObject({
      calendar: null,
      calendarChosen: true,
      pendingRequest: null,
      holidays: [],
    });
    expect(await teamCalendarDays(team)).toEqual([]);
  });

  it("refuses a stale version and a second decision", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    const admin = team.as(team.admin);
    await choose(member, team, DE_BY);
    const first = (await choose(member, team, FR)).pendingRequest!;

    // Asking again for the same target changes nothing.
    expect((await choose(member, team, FR)).pendingRequest).toMatchObject({
      id: first.id,
      version: 0,
    });
    const resubmitted = (await choose(member, team, { country: "DE" }))
      .pendingRequest!;
    expect(resubmitted).toMatchObject({
      id: first.id,
      version: 1,
      calendar: { country: "DE", region: null },
      createdAt: first.createdAt,
    });
    expect(resubmitted.updatedAt >= first.updatedAt).toBe(true);

    const stale = await decide(admin, team, first, "approve");
    expect(stale.status).toBe(409);
    expect(await readErrorBody(stale)).toMatchObject({
      code: "TIME_OFF_CHANGED",
    });
    expect(await storedCalendar(team, team.member.id)).toEqual(DE_BY);

    expect((await decide(admin, team, resubmitted, "approve")).status).toBe(
      200,
    );
    expect(await storedCalendar(team, team.member.id)).toEqual({
      country: "DE",
      region: null,
    });
    for (const action of ["approve", "decline"] as const) {
      const again = await decide(admin, team, resubmitted, action);
      expect(again.status).toBe(409);
      expect(await readErrorBody(again)).toMatchObject({
        code: "TIME_OFF_STATUS",
      });
    }
  });

  it("leaves the calendar unchanged on decline", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    await choose(member, team, DE_BY);
    const request = (await choose(member, team, FR)).pendingRequest!;

    const declined = await decide(
      team.as(team.owner),
      team,
      request,
      "decline",
    );
    expect(declined.status).toBe(200);
    expect(await declined.json()).toMatchObject({
      status: "declined",
      updatedAt: request.updatedAt,
    });
    expect(await holidays(member, team)).toMatchObject({
      calendar: DE_BY,
      pendingRequest: null,
    });
    expect(await teamCalendarDays(team)).toContain(`${NEXT}-01-06`);
  });

  it("marks a request approved without a calendar change when it is already in effect", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    await choose(member, team, DE_BY);
    const request = (await choose(member, team, FR)).pendingRequest!;
    // The member's calendar already became the target another way.
    await db
      .update(schema.timeOffHolidayCalendarTable)
      .set({ country: "FR", region: null })
      .where(eq(schema.timeOffHolidayCalendarTable.userId, team.member.id));
    published.length = 0;

    const approved = await decide(
      team.as(team.admin),
      team,
      request,
      "approve",
    );
    expect(approved.status).toBe(200);
    expect(published.map(({ event }) => event)).toEqual([
      "time-off.holiday-calendar-request-changed",
      // The member hears about the decision.
      "notification.created",
    ]);
  });

  it("refuses to approve a calendar the holiday data no longer knows", async () => {
    const team = await createTimeOffTeam();
    await choose(team.as(team.member), team, DE_BY);
    const [request] = await db
      .insert(schema.timeOffHolidayCalendarRequestTable)
      .values({
        workspaceId: team.workspaceId,
        userId: team.member.id,
        country: "ZZ",
      })
      .returning();

    const response = await decide(
      team.as(team.admin),
      team,
      { id: request!.id, version: 0 },
      "approve",
    );
    expect(response.status).toBe(400);
    expect(await readErrorBody(response)).toMatchObject({
      code: "TIME_OFF_HOLIDAY_CALENDAR_UNKNOWN",
    });
    expect(
      (
        await decide(
          team.as(team.admin),
          team,
          { id: request!.id, version: 0 },
          "decline",
        )
      ).status,
    ).toBe(200);
  });

  it("lists pending requests oldest first with the calendar they replace", async () => {
    const team = await createTimeOffTeam();
    await choose(team.as(team.member), team, DE_BY);
    const memberRequest = (await choose(team.as(team.member), team, FR))
      .pendingRequest!;
    await setDeadline(team, addDays(todayUtc(), -1));
    const colleagueRequest = (await choose(team.as(team.colleague), team, null))
      .pendingRequest!;

    const response = await team.as(team.admin)(
      `/workspace/${team.workspaceId}/holiday-calendar-requests?lang=de`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      workspaceId: team.workspaceId,
      requests: [
        {
          id: memberRequest.id,
          userId: team.member.id,
          calendar: { country: "FR", region: null },
          currentCalendar: { ...DE_BY, regionName: "Bayern" },
        },
        {
          id: colleagueRequest.id,
          userId: team.colleague.id,
          calendar: null,
          currentCalendar: null,
        },
      ],
    });
  });

  it("answers a request of another workspace or an unknown id with 404", async () => {
    const team = await createTimeOffTeam();
    const other = await createTimeOffTeam();
    await choose(other.as(other.member), other, DE_BY);
    const foreign = (await choose(other.as(other.member), other, FR))
      .pendingRequest!;
    for (const request of [foreign, { id: "missing", version: 0 }]) {
      expect(
        (await decide(team.as(team.admin), team, request, "approve")).status,
      ).toBe(404);
      expect(
        (
          await team.as(team.admin)(
            requestPath(team, request.id, "cancel"),
            "POST",
          )
        ).status,
      ).toBe(404);
    }
  });
});

describe("withdrawing a calendar request", () => {
  it("lets the requester and an approver cancel, and refuses one no longer pending", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    await choose(member, team, DE_BY);

    const mine = (await choose(member, team, FR)).pendingRequest!;
    const withdrawn = await member(
      requestPath(team, mine.id, "cancel"),
      "POST",
    );
    expect(withdrawn.status).toBe(200);
    expect(await withdrawn.json()).toMatchObject({
      id: mine.id,
      status: "cancelled",
      updatedAt: mine.updatedAt,
    });
    const again = await member(requestPath(team, mine.id, "cancel"), "POST");
    expect(again.status).toBe(409);
    expect(await readErrorBody(again)).toMatchObject({
      code: "TIME_OFF_STATUS",
    });

    const next = (await choose(member, team, FR)).pendingRequest!;
    expect(next.id).not.toBe(mine.id);
    expect(
      (await team.as(team.admin)(requestPath(team, next.id, "cancel"), "POST"))
        .status,
    ).toBe(200);
    expect(await holidays(member, team)).toMatchObject({
      calendar: DE_BY,
      pendingRequest: null,
    });
  });

  it("withdraws your own request when you send your current calendar again", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    await choose(member, team, DE_BY);
    await choose(member, team, FR);

    expect(await choose(member, team, DE_BY)).toMatchObject({
      status: "applied",
      calendar: DE_BY,
      pendingRequest: null,
    });
    expect(await requestStatuses(team.member.id)).toEqual(["cancelled"]);
  });
});

describe("approvers changing calendars", () => {
  it("leaves a member's request pending when an approver re-saves their calendar", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    await choose(member, team, DE_BY);
    const request = (await choose(member, team, FR)).pendingRequest!;

    const resaved = await choose(
      team.as(team.admin),
      team,
      DE_BY,
      team.member.id,
    );
    expect(resaved).toMatchObject({
      status: "applied",
      calendar: DE_BY,
      pendingRequest: { id: request.id, status: "pending" },
    });
    expect(await requestStatuses(team.member.id)).toEqual(["pending"]);
  });

  it("approves a member's request when an approver sets the target", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    await choose(member, team, DE_BY);
    const request = (await choose(member, team, FR)).pendingRequest!;

    expect(
      await choose(team.as(team.admin), team, FR, team.member.id),
    ).toMatchObject({ status: "applied", calendar: FR, pendingRequest: null });
    const [row] = await db
      .select()
      .from(schema.timeOffHolidayCalendarRequestTable)
      .where(
        eq(schema.timeOffHolidayCalendarRequestTable.userId, team.member.id),
      );
    expect(row).toMatchObject({
      status: "approved",
      statusChangedBy: team.admin.id,
    });
    expect(row!.updatedAt.toISOString()).toBe(request.updatedAt);
  });

  it("applies an approver's own changes every time", async () => {
    const team = await createTimeOffTeam();
    await setDeadline(team, addDays(todayUtc(), -1));
    const admin = team.as(team.admin);
    for (const calendar of [DE_BY, FR, null, DE_BY])
      expect(await choose(admin, team, calendar)).toMatchObject({
        status: "applied",
        calendar,
        pendingRequest: null,
      });
    expect(await holidays(admin, team)).toMatchObject({
      nextChangeNeedsApproval: false,
    });
    expect(await requestStatuses(team.admin.id)).toEqual([]);
  });

  it("uses up a member's free choice when an approver sets it", async () => {
    const team = await createTimeOffTeam();
    await choose(team.as(team.admin), team, null, team.member.id);
    expect(await holidays(team.as(team.member), team)).toMatchObject({
      calendar: null,
      calendarChosen: true,
      nextChangeNeedsApproval: true,
    });
    expect((await choose(team.as(team.member), team, DE_BY)).status).toBe(
      "pending",
    );
  });
});

describe("removing a member", () => {
  it("cancels their pending calendar request and keeps their calendar", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    await choose(member, team, DE_BY);
    await choose(member, team, FR);

    const instanceAdmin = await createInstanceAdmin();
    const removed = await callerFor(
      team.app,
      instanceAdmin.id,
      {},
      "/admin",
    )(`/workspaces/${team.workspaceId}/members/${team.member.id}`, "DELETE");
    expect(removed.status).toBe(200);

    expect(await requestStatuses(team.member.id)).toEqual(["cancelled"]);
    expect(await storedCalendar(team, team.member.id)).toEqual(DE_BY);
    const list = await team.as(team.admin)(
      `/workspace/${team.workspaceId}/holiday-calendar-requests`,
    );
    expect((await list.json()).requests).toEqual([]);
  });
});

describe("holiday calendar request live updates", () => {
  function listen(users: Array<{ id: string }>) {
    const received = new Map<string, unknown[]>();
    for (const user of users) {
      const messages: unknown[] = [];
      received.set(user.id, messages);
      const ws = {
        send: (data: string) => {
          const message = JSON.parse(data);
          if (message.type === "TIME_OFF_UPDATED") messages.push(message);
        },
        close: () => {},
      };
      sockets.push({
        userId: user.id,
        connection: addUserConnection(user.id, ws as unknown as WSContext),
      });
    }
    return {
      // The users that got a data-free update. An approval sends one for
      // the request and one for the calendar.
      take(workspaceId: string) {
        const told: string[] = [];
        for (const [userId, messages] of received) {
          if (messages.length === 0) continue;
          for (const message of messages)
            expect(message).toEqual({ type: "TIME_OFF_UPDATED", workspaceId });
          told.push(userId);
          messages.length = 0;
        }
        return told.sort();
      },
    };
  }

  const events = (name: string) =>
    published.filter(({ event }) => event === name).map(({ data }) => data);

  it("tells only approvers and the member of a pending change, and everyone of its approval", async () => {
    const team = await createTimeOffTeam();
    const { owner, admin, member, colleague, viewer, workspaceId } = team;
    const { project } = await createProjectFixture({ workspaceId });
    await insertTask(project.id, { userId: member.id });
    const outsider = await createWorkspaceMember();
    await choose(team.as(member), team, DE_BY);
    published.length = 0;
    const socket = listen([
      owner,
      admin,
      member,
      colleague,
      viewer,
      outsider.user,
    ]);

    const request = (await choose(team.as(member), team, FR)).pendingRequest!;
    expect(socket.take(workspaceId)).toEqual(
      [owner.id, admin.id, member.id].sort(),
    );
    expect(events("time-off.holiday-calendar-request-changed")).toEqual([
      {
        workspaceId,
        requestId: request.id,
        userId: member.id,
        actorId: member.id,
        previousStatus: null,
        status: "pending",
      },
    ]);
    expect(events("time-off.holiday-calendar-changed")).toEqual([]);
    expect(events("project-schedule.changed")).toEqual([]);

    published.length = 0;
    expect(
      (await decide(team.as(owner), team, request, "approve")).status,
    ).toBe(200);
    expect(socket.take(workspaceId)).toEqual(
      [owner.id, admin.id, member.id, colleague.id, viewer.id].sort(),
    );
    expect(events("time-off.holiday-calendar-request-changed")).toEqual([
      expect.objectContaining({
        requestId: request.id,
        actorId: owner.id,
        previousStatus: "pending",
        status: "approved",
      }),
    ]);
    expect(events("time-off.holiday-calendar-changed")).toEqual([
      { workspaceId, userId: member.id },
    ]);
    expect(events("project-schedule.changed")).toEqual([
      { workspaceId, projectIds: [project.id] },
    ]);
    // Events carry ids and statuses only.
    expect(JSON.stringify(published)).not.toMatch(
      /"DE"|"BY"|"FR"|Germany|France|Bavaria|Bayern/,
    );
  });

  it("tells everyone when the deadline changes", async () => {
    const team = await createTimeOffTeam();
    const { owner, admin, member, colleague, viewer, workspaceId } = team;
    const socket = listen([owner, admin, member, colleague, viewer]);
    await setDeadline(team, todayUtc());
    expect(socket.take(workspaceId)).toEqual(
      [owner.id, admin.id, member.id, colleague.id, viewer.id].sort(),
    );
    expect(events("time-off.settings-changed")).toEqual([{ workspaceId }]);
    // Saving the same deadline again publishes nothing.
    published.length = 0;
    await setDeadline(team, todayUtc());
    expect(published).toEqual([]);
  });

  it("announces the last of two deadline saves that race", async () => {
    const team = await createTimeOffTeam();
    const path = `/workspace/${team.workspaceId}/settings`;
    const save = (holidayCalendarDeadline: string | null) =>
      team.as(team.owner)(path, "PUT", { holidayCalendarDeadline });
    for (let round = 0; round < 5; round += 1) {
      await setDeadline(team, null);
      published.length = 0;
      const responses = await Promise.all([save(`${NEXT}-01-31`), save(null)]);
      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      const { holidayCalendarDeadline } = await (
        await team.as(team.owner)(path)
      ).json();
      // Saved one after the other: setting then clearing announces both,
      // clearing (no change) then setting announces only the setting.
      expect(events("time-off.settings-changed")).toHaveLength(
        holidayCalendarDeadline === null ? 2 : 1,
      );
    }
  });
});

describe("holiday calendar request notifications", () => {
  async function notices() {
    return db
      .select()
      .from(schema.notificationTable)
      .where(like(schema.notificationTable.type, "time_off_%"));
  }

  async function recipients() {
    return (await notices()).map((row) => `${row.type}:${row.userId}`).sort();
  }

  async function clearNotices() {
    await db.delete(schema.notificationTable);
  }

  // Codes and names of the calendars these tests use, quoted or spelled out.
  const CALENDAR_TEXT =
    /"DE"|"BY"|"FR"|Germany|Deutschland|France|Bavaria|Bayern/;

  it("tells approvers about a new request and the member about the decision", async () => {
    const team = await createTimeOffTeam();
    const { owner, admin, member, workspaceId } = team;
    await choose(team.as(member), team, DE_BY);
    // The free first choice notifies nobody.
    expect(await recipients()).toEqual([]);

    const request = (await choose(team.as(member), team, FR)).pendingRequest!;
    expect(await recipients()).toEqual(
      [
        `time_off_holiday_calendar_requested:${owner.id}`,
        `time_off_holiday_calendar_requested:${admin.id}`,
      ].sort(),
    );
    const [row] = await notices();
    expect(row).toMatchObject({
      title: null,
      content: null,
      resourceType: "workspace",
      resourceId: workspaceId,
      eventData: {
        workspaceId,
        requestId: request.id,
        requesterId: member.id,
        requesterName: member.name,
      },
    });
    expect(Object.keys(row?.eventData as object).sort()).toEqual(
      ["workspaceId", "requestId", "requesterId", "requesterName"].sort(),
    );

    // Resubmitting updates the request without telling anyone again.
    await clearNotices();
    const resubmitted = (await choose(team.as(member), team, { country: "DE" }))
      .pendingRequest!;
    expect(await recipients()).toEqual([]);

    expect(
      (await decide(team.as(admin), team, resubmitted, "approve")).status,
    ).toBe(200);
    expect(await recipients()).toEqual([
      `time_off_holiday_calendar_approved:${member.id}`,
    ]);
    expect((await notices())[0]?.eventData).toEqual({
      workspaceId,
      requestId: request.id,
      deciderId: admin.id,
      deciderName: admin.name,
    });

    const next = (await choose(team.as(member), team, FR)).pendingRequest!;
    await clearNotices();
    expect((await decide(team.as(owner), team, next, "decline")).status).toBe(
      200,
    );
    expect(await recipients()).toEqual([
      `time_off_holiday_calendar_declined:${member.id}`,
    ]);
    expect((await notices())[0]?.eventData).toMatchObject({
      requestId: next.id,
      deciderId: owner.id,
      deciderName: owner.name,
    });
  });

  it("tells the member when an approver applies the calendar they asked for", async () => {
    const team = await createTimeOffTeam();
    const { admin, member } = team;
    await choose(team.as(member), team, DE_BY);
    await choose(team.as(member), team, FR);
    await clearNotices();

    await choose(team.as(admin), team, FR, member.id);
    expect(await recipients()).toEqual([
      `time_off_holiday_calendar_approved:${member.id}`,
    ]);
  });

  it("notifies nobody for withdrawals, approver changes or a removed member", async () => {
    const team = await createTimeOffTeam();
    const { admin, member, workspaceId } = team;
    const memberCalls = team.as(member);
    await choose(memberCalls, team, DE_BY);

    const withdrawn = (await choose(memberCalls, team, FR)).pendingRequest!;
    await clearNotices();
    expect(
      (await memberCalls(requestPath(team, withdrawn.id, "cancel"), "POST"))
        .status,
    ).toBe(200);
    expect(await recipients()).toEqual([]);

    // Sending the current calendar again withdraws a new request.
    await choose(memberCalls, team, FR);
    await clearNotices();
    expect((await choose(memberCalls, team, DE_BY)).pendingRequest).toBeNull();
    expect(await recipients()).toEqual([]);

    const cancelled = (await choose(memberCalls, team, FR)).pendingRequest!;
    await clearNotices();
    expect(
      (await team.as(admin)(requestPath(team, cancelled.id, "cancel"), "POST"))
        .status,
    ).toBe(200);
    expect(await recipients()).toEqual([]);

    // An approver re-saving the member's calendar keeps the request; applying
    // another one cancels it; their own changes always apply.
    await choose(memberCalls, team, FR);
    await clearNotices();
    await choose(team.as(admin), team, DE_BY, member.id);
    await choose(team.as(admin), team, null, member.id);
    for (const calendar of [DE_BY, FR, null])
      await choose(team.as(admin), team, calendar);
    expect(await recipients()).toEqual([]);

    await choose(memberCalls, team, FR);
    await clearNotices();
    const instanceAdmin = await createInstanceAdmin();
    expect(
      (
        await callerFor(
          team.app,
          instanceAdmin.id,
          {},
          "/admin",
        )(`/workspaces/${workspaceId}/members/${member.id}`, "DELETE")
      ).status,
    ).toBe(200);
    expect(await requestStatuses(member.id)).toContain("cancelled");
    expect(await recipients()).toEqual([]);
  });

  it("skips the decision notice when members decide their own request", async () => {
    const team = await createTimeOffTeam();
    const { member, workspaceId } = team;
    await choose(team.as(member), team, DE_BY);
    const request = (await choose(team.as(member), team, FR)).pendingRequest!;
    await setMemberRole(workspaceId, member.id, "admin");
    await clearNotices();

    expect(
      (await decide(team.as(member), team, request, "approve")).status,
    ).toBe(200);
    expect(await recipients()).toEqual([]);
  });

  it("never names a country or region in a notification", async () => {
    const team = await createTimeOffTeam();
    const { admin, member } = team;
    await choose(team.as(member), team, DE_BY);
    const first = (await choose(team.as(member), team, FR)).pendingRequest!;
    await decide(team.as(admin), team, first, "approve");
    const second = (await choose(team.as(member), team, DE_BY)).pendingRequest!;
    await decide(team.as(admin), team, second, "decline");

    const rows = await notices();
    expect(new Set(rows.map((row) => row.type))).toEqual(
      new Set([
        "time_off_holiday_calendar_requested",
        "time_off_holiday_calendar_approved",
        "time_off_holiday_calendar_declined",
      ]),
    );
    expect(JSON.stringify(rows)).not.toMatch(CALENDAR_TEXT);
    // The inbox as the API serves it, to approvers and to the member.
    for (const person of [team.owner, admin, member]) {
      const inbox = await callerFor(
        team.app,
        person.id,
        {},
        "/notification",
      )("");
      expect(inbox.status).toBe(200);
      expect(await inbox.text()).not.toMatch(CALENDAR_TEXT);
    }
  });
});

describe("time off settings", () => {
  it("reads, sets and clears the deadline for approvers only", async () => {
    const team = await createTimeOffTeam();
    const path = `/workspace/${team.workspaceId}/settings`;
    const owner = team.as(team.owner);

    expect(await (await owner(path)).json()).toEqual({
      workspaceId: team.workspaceId,
      holidayCalendarDeadline: null,
    });
    const set = await owner(path, "PUT", {
      holidayCalendarDeadline: `${NEXT}-01-31`,
    });
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({
      workspaceId: team.workspaceId,
      holidayCalendarDeadline: `${NEXT}-01-31`,
    });
    expect(await (await team.as(team.admin)(path)).json()).toMatchObject({
      holidayCalendarDeadline: `${NEXT}-01-31`,
    });
    expect(await holidays(team.as(team.member), team)).toMatchObject({
      holidayCalendarDeadline: `${NEXT}-01-31`,
    });

    expect(
      await (
        await owner(path, "PUT", { holidayCalendarDeadline: null })
      ).json(),
    ).toMatchObject({ holidayCalendarDeadline: null });
    expect(await (await owner(path)).json()).toMatchObject({
      holidayCalendarDeadline: null,
    });

    for (const body of [
      { holidayCalendarDeadline: `${NEXT}-02-30` },
      { holidayCalendarDeadline: "tomorrow" },
      {},
      { holidayCalendarDeadline: null, extra: true },
    ]) {
      expect((await owner(path, "PUT", body)).status).toBe(400);
    }

    for (const person of [team.member, team.viewer]) {
      const caller = team.as(person);
      for (const response of [
        await caller(path),
        await caller(path, "PUT", { holidayCalendarDeadline: null }),
      ]) {
        expect(response.status).toBe(403);
      }
    }
  });
});
