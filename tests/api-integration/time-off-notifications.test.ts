import { randomUUID } from "node:crypto";
import * as email from "@kaneo/email";
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
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { sendOutboundRequest } from "../../apps/api/src/utils/outbound-request";
import { handleMemberRemoved } from "../../apps/api/src/workspace-members/handle-member-removed";
import { addUserConnection, removeUserConnection } from "../../apps/api/src/ws";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";
import {
  addDays,
  insertTimeOff,
  mondayInWeeks,
  setMemberRole,
  setWorkspaceRolePermissions,
} from "./helpers/time-off";
import {
  callerFor,
  createTimeOffTeam,
  type TimeOffTeam,
} from "./helpers/time-off-team";

vi.mock("@kaneo/email", async (original) => ({
  ...(await original<object>()),
  sendNotificationEmail: vi.fn(async () => undefined),
}));

vi.mock("../../apps/api/src/utils/outbound-request", async (original) => ({
  ...(await original<object>()),
  sendOutboundRequest: vi.fn(async () => new Response(null, { status: 200 })),
}));

vi.mock("../../apps/api/src/events", async (original) => {
  const { awaitEventHandlers } = await import("./helpers/await-event-handlers");
  return awaitEventHandlers(original);
});

const sockets: Array<{
  userId: string;
  connection: ReturnType<typeof addUserConnection>;
}> = [];

beforeEach(async () => {
  vi.stubEnv("NOTIFICATION_SECRET_ENCRYPTION_KEY", "notification-test-key");
  await resetTestDatabase();
  vi.clearAllMocks();
});

afterEach(() => {
  for (const { userId, connection } of sockets.splice(0))
    removeUserConnection(userId, connection);
  vi.unstubAllEnvs();
});

// Monday to Friday, `weeks` weeks from this week: five weekdays.
function week(weeks = 2) {
  const startDate = mondayInWeeks(weeks);
  return { startDate, endDate: addDays(startDate, 4) };
}

async function timeOffNotifications() {
  return db
    .select()
    .from(schema.notificationTable)
    .where(like(schema.notificationTable.type, "time_off_%"));
}

async function recipients() {
  return (await timeOffNotifications())
    .map((row) => `${row.type}:${row.userId}`)
    .sort();
}

async function clearNotifications() {
  await db.delete(schema.notificationTable);
}

async function requestTimeOff(
  team: TimeOffTeam,
  user: { id: string },
  body: Record<string, unknown> = {},
) {
  const response = await team.as(user)(
    `/workspace/${team.workspaceId}`,
    "POST",
    {
      type: "public_holiday",
      ...week(),
      ...body,
    },
  );
  expect(response.status).toBe(200);
  return (await response.json()).request as {
    id: string;
    version: number;
    startDate: string;
    endDate: string;
  };
}

async function decide(
  team: TimeOffTeam,
  user: { id: string },
  id: string,
  decision: "approve" | "decline",
  version = 0,
) {
  const response = await team.as(user)(`/${id}/${decision}`, "POST", {
    version,
  });
  expect(response.status).toBe(200);
}

const sorted = (...values: string[]) => [...values].sort();

// The member's free first calendar choice, then a change that waits for
// approval. Returns the pending request.
async function requestCalendarChange(team: TimeOffTeam, user: { id: string }) {
  const path = `/workspace/${team.workspaceId}/holiday-calendar`;
  const first = await team.as(user)(path, "PUT", {
    country: "DE",
    region: "BY",
  });
  expect(first.status).toBe(200);
  const second = await team.as(user)(path, "PUT", { country: "FR" });
  expect(second.status).toBe(200);
  const body = await second.json();
  expect(body.status).toBe("pending");
  return body.pendingRequest as { id: string; version: number };
}

// Codes and names of the calendars above, quoted or spelled out.
const CALENDAR_TEXT =
  /"DE"|"BY"|"FR"|Germany|Deutschland|France|Bavaria|Bayern/;

describe("time off notifications", () => {
  it("tells approvers about a new request, except the approver who made it", async () => {
    const team = await createTimeOffTeam();
    const { owner, admin, member, colleague, workspaceId } = team;
    const request = await requestTimeOff(team, member, {
      note: "Dentist secret",
    });

    expect(await recipients()).toEqual(
      sorted(
        `time_off_requested:${owner.id}`,
        `time_off_requested:${admin.id}`,
      ),
    );
    const [row] = await timeOffNotifications();
    expect(row).toMatchObject({
      title: null,
      content: null,
      resourceType: "workspace",
      resourceId: workspaceId,
      eventData: {
        workspaceId,
        timeOffId: request.id,
        requesterId: member.id,
        requesterName: member.name,
        startDate: request.startDate,
        endDate: request.endDate,
        days: 5,
      },
    });
    expect(Object.keys(row?.eventData as object).sort()).toEqual(
      sorted(
        "workspaceId",
        "timeOffId",
        "requesterId",
        "requesterName",
        "startDate",
        "endDate",
        "days",
      ),
    );

    await clearNotifications();
    await requestTimeOff(team, admin);
    expect(await recipients()).toEqual([`time_off_requested:${owner.id}`]);

    await clearNotifications();
    await requestTimeOff(team, owner, { userId: colleague.id });
    expect(await recipients()).toEqual([`time_off_requested:${admin.id}`]);
  });

  it("tells the requester about the decision and readers that they are away", async () => {
    const team = await createTimeOffTeam();
    const { owner, admin, member, colleague, viewer } = team;
    const approved = await requestTimeOff(team, member);
    await clearNotifications();
    await decide(team, admin, approved.id, "approve");

    expect(await recipients()).toEqual(
      sorted(
        `time_off_approved:${member.id}`,
        `time_off_member_away:${owner.id}`,
        `time_off_member_away:${colleague.id}`,
        `time_off_member_away:${viewer.id}`,
      ),
    );
    const rows = await timeOffNotifications();
    expect(
      rows.find((row) => row.type === "time_off_approved")?.eventData,
    ).toEqual({
      workspaceId: team.workspaceId,
      timeOffId: approved.id,
      startDate: approved.startDate,
      endDate: approved.endDate,
      days: 5,
      deciderId: admin.id,
      deciderName: admin.name,
    });
    expect(
      rows.find((row) => row.type === "time_off_member_away")?.eventData,
    ).toEqual({
      workspaceId: team.workspaceId,
      timeOffId: approved.id,
      userId: member.id,
      userName: member.name,
      startDate: approved.startDate,
      endDate: approved.endDate,
    });

    const declined = await requestTimeOff(team, colleague);
    await clearNotifications();
    await decide(team, admin, declined.id, "decline");
    expect(await recipients()).toEqual([`time_off_declined:${colleague.id}`]);
  });

  it("skips the decision notice when approvers approve their own time off", async () => {
    const team = await createTimeOffTeam();
    const { owner, admin, member, colleague, viewer } = team;
    const request = await requestTimeOff(team, owner);
    await clearNotifications();
    await decide(team, owner, request.id, "approve");

    expect(await recipients()).toEqual(
      sorted(
        `time_off_member_away:${admin.id}`,
        `time_off_member_away:${member.id}`,
        `time_off_member_away:${colleague.id}`,
        `time_off_member_away:${viewer.id}`,
      ),
    );
  });

  it("sends the away notice only to members who can read the team timeline", async () => {
    const team = await createTimeOffTeam();
    const { owner, admin, member, colleague, viewer, workspaceId } = team;
    await setWorkspaceRolePermissions(workspaceId, "contractor", {
      workspace: ["read"],
      task: ["create", "read", "update"],
    });
    await setMemberRole(workspaceId, colleague.id, "contractor");
    const request = await requestTimeOff(team, member);
    await clearNotifications();
    await decide(team, admin, request.id, "approve");

    expect(await recipients()).toEqual(
      sorted(
        `time_off_approved:${member.id}`,
        `time_off_member_away:${owner.id}`,
        `time_off_member_away:${viewer.id}`,
      ),
    );
  });

  it("does not announce time off that has already ended", async () => {
    const team = await createTimeOffTeam();
    const past = await insertTimeOff({
      workspaceId: team.workspaceId,
      userId: team.member.id,
      ...week(-1),
    });
    await decide(team, team.admin, past.id, "approve");
    expect(await recipients()).toEqual([`time_off_approved:${team.member.id}`]);
  });

  it("lets members turn off teammate time off without muting their own requests", async () => {
    const team = await createTimeOffTeam();
    const { owner, admin, member, colleague, viewer } = team;
    for (const user of [owner, member, colleague]) {
      const preferences = callerFor(
        team.app,
        user.id,
        {},
        "/notification-preferences",
      );
      const updated = await preferences("", "PUT", {
        teamTimeOffEnabled: false,
      });
      expect(updated.status).toBe(200);
      expect((await updated.json()).teamTimeOffEnabled).toBe(false);
      expect((await (await preferences("")).json()).teamTimeOffEnabled).toBe(
        false,
      );
    }
    expect(
      (
        await (
          await callerFor(
            team.app,
            viewer.id,
            {},
            "/notification-preferences",
          )("")
        ).json()
      ).teamTimeOffEnabled,
    ).toBe(true);

    const request = await requestTimeOff(team, member);
    expect(await recipients()).toEqual(
      sorted(
        `time_off_requested:${owner.id}`,
        `time_off_requested:${admin.id}`,
      ),
    );
    await clearNotifications();
    await decide(team, admin, request.id, "approve");
    expect(await recipients()).toEqual(
      sorted(
        `time_off_approved:${member.id}`,
        `time_off_member_away:${viewer.id}`,
      ),
    );
  });

  it("notifies nobody for edits and cancellations", async () => {
    const team = await createTimeOffTeam();
    const { admin, member, colleague } = team;
    const pending = await requestTimeOff(team, member);
    const approved = await requestTimeOff(team, colleague);
    await decide(team, admin, approved.id, "approve");
    await clearNotifications();

    for (const [user, path, method, body] of [
      [member, `/${pending.id}`, "PATCH", { note: "Changed" }],
      [member, `/${pending.id}/cancel`, "POST", undefined],
      [
        admin,
        `/${approved.id}`,
        "PATCH",
        {
          endDate: addDays(approved.startDate, 2),
        },
      ],
      [admin, `/${approved.id}/cancel`, "POST", undefined],
    ] as const) {
      const response = await team.as(user)(path, method, body);
      expect(response.status).toBe(200);
    }
    expect(await recipients()).toEqual([]);
  });
});

describe("time off realtime", () => {
  // A fake socket per user that records the TIME_OFF_UPDATED messages it gets.
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
      // The users that got exactly one data-free update, and anyone else.
      take(workspaceId: string) {
        const told: string[] = [];
        for (const [userId, messages] of received) {
          if (messages.length === 0) continue;
          expect(messages).toEqual([{ type: "TIME_OFF_UPDATED", workspaceId }]);
          told.push(userId);
          messages.length = 0;
        }
        return told.sort();
      },
    };
  }

  it("updates the requester and approvers for pending changes and everyone for approved ones", async () => {
    const team = await createTimeOffTeam();
    const { owner, admin, member, colleague, viewer, workspaceId } = team;
    const outsider = await createWorkspaceMember();
    const everyone = sorted(
      owner.id,
      admin.id,
      member.id,
      colleague.id,
      viewer.id,
    );
    const socket = listen([
      owner,
      admin,
      member,
      colleague,
      viewer,
      outsider.user,
    ]);

    const request = await requestTimeOff(team, member);
    expect(socket.take(workspaceId)).toEqual(
      sorted(owner.id, admin.id, member.id),
    );

    const edited = await team.as(member)(`/${request.id}`, "PATCH", {
      note: "Changed",
    });
    expect(edited.status).toBe(200);
    expect(socket.take(workspaceId)).toEqual(
      sorted(owner.id, admin.id, member.id),
    );

    await decide(team, admin, request.id, "approve", 1);
    expect(socket.take(workspaceId)).toEqual(everyone);

    const cancelled = await team.as(member)(`/${request.id}/cancel`, "POST");
    expect(cancelled.status).toBe(200);
    expect(socket.take(workspaceId)).toEqual(everyone);

    const allowance = await team.as(owner)(
      `/workspace/${workspaceId}/allowance/vacation`,
      "PUT",
      { days: 20 },
    );
    expect(allowance.status).toBe(200);
    expect(socket.take(workspaceId)).toEqual(everyone);
  });

  it("updates everyone but notifies nobody when a holiday calendar changes", async () => {
    const team = await createTimeOffTeam();
    const { owner, admin, member, colleague, viewer, workspaceId } = team;
    const outsider = await createWorkspaceMember();
    const socket = listen([
      owner,
      admin,
      member,
      colleague,
      viewer,
      outsider.user,
    ]);
    const everyone = sorted(
      owner.id,
      admin.id,
      member.id,
      colleague.id,
      viewer.id,
    );
    const path = `/workspace/${workspaceId}/holiday-calendar`;

    expect(
      (await team.as(member)(path, "PUT", { country: "DE", region: "BY" }))
        .status,
    ).toBe(200);
    expect(socket.take(workspaceId)).toEqual(everyone);
    // A change after the member's free choice needs approval; an approver's
    // applies at once.
    expect(
      (await team.as(admin)(`${path}?userId=${member.id}`, "DELETE")).status,
    ).toBe(200);
    expect(socket.take(workspaceId)).toEqual(everyone);
    expect(await timeOffNotifications()).toEqual([]);
  });

  it("updates approvers but notifies nobody when a removed member's requests are cleared", async () => {
    const team = await createTimeOffTeam();
    const { owner, admin, member, colleague, viewer, workspaceId } = team;
    const request = await requestTimeOff(team, member);
    await clearNotifications();
    const socket = listen([owner, admin, member, colleague, viewer]);

    await db
      .delete(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, workspaceId),
          eq(schema.workspaceUserTable.userId, member.id),
        ),
      );
    await handleMemberRemoved({
      workspaceId,
      userId: member.id,
      userRole: "member",
    });

    const [row] = await db
      .select({ status: schema.timeOffTable.status })
      .from(schema.timeOffTable)
      .where(eq(schema.timeOffTable.id, request.id));
    expect(row?.status).toBe("cancelled");
    expect(socket.take(workspaceId)).toEqual(sorted(owner.id, admin.id));
    expect(await recipients()).toEqual([]);
  });
  it("clears a member's time off when they leave the workspace themselves", async () => {
    const team = await createTimeOffTeam();
    const { owner, admin, member, colleague, viewer, workspaceId } = team;
    const request = await requestTimeOff(team, member, {
      note: "Medical appointment",
    });
    await clearNotifications();
    const socket = listen([owner, admin, member, colleague, viewer]);
    const token = `leave-${randomUUID()}`;
    await db.insert(schema.sessionTable).values({
      id: randomUUID(),
      userId: member.id,
      token,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await auth.handler(
      new Request("http://localhost:1337/api/auth/organization/leave", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ organizationId: workspaceId }),
      }),
    );
    expect(response.status).toBe(200);

    const [row] = await db
      .select({
        status: schema.timeOffTable.status,
        note: schema.timeOffTable.note,
      })
      .from(schema.timeOffTable)
      .where(eq(schema.timeOffTable.id, request.id));
    expect(row).toEqual({ status: "cancelled", note: null });
    expect(socket.take(workspaceId)).toEqual(sorted(owner.id, admin.id));
    expect(await recipients()).toEqual([]);
  });

  it("finds approvers the way the routes do, for duplicate rows and instance admins", async () => {
    const team = await createTimeOffTeam();
    const { owner, admin, member, colleague, viewer, workspaceId } = team;
    // The viewer's first membership row decides; a later one says admin.
    await db.insert(schema.workspaceUserTable).values({
      workspaceId,
      userId: viewer.id,
      role: "admin",
      joinedAt: new Date(Date.now() + 60_000),
    });
    // An instance admin whose workspace role can't approve.
    await db
      .update(schema.userTable)
      .set({ role: "admin" })
      .where(eq(schema.userTable.id, colleague.id));
    const pending = `/workspace/${workspaceId}/pending`;
    expect((await team.as(viewer)(pending)).status).toBe(403);
    expect((await team.as(colleague)(pending)).status).toBe(200);
    const socket = listen([owner, admin, member, colleague, viewer]);

    await requestTimeOff(team, member);

    expect(await recipients()).toEqual(
      sorted(
        `time_off_requested:${owner.id}`,
        `time_off_requested:${admin.id}`,
        `time_off_requested:${colleague.id}`,
      ),
    );
    expect(socket.take(workspaceId)).toEqual(
      sorted(owner.id, admin.id, colleague.id, member.id),
    );
  });
});

describe("time off notifications for scoped API keys", () => {
  async function keyFor(
    userId: string,
    permissions?: Record<string, string[]>,
  ) {
    const { key } = await auth.api.createApiKey({
      body: { userId, name: "Notification scope test", permissions },
    });
    return key;
  }

  it("lists time off notices only when the key may read or approve time off", async () => {
    const team = await createTimeOffTeam();
    const { owner, admin, member } = team;
    const request = await requestTimeOff(team, member);
    await decide(team, admin, request.id, "approve");
    await requestCalendarChange(team, member);
    await db.insert(schema.notificationTable).values({
      userId: owner.id,
      type: "info",
      title: "Heads up",
      content: "Maintenance tonight",
    });

    async function typesFor(headers: Record<string, string>) {
      const response = await callerFor(
        team.app,
        Object.keys(headers).length === 0 ? owner.id : null,
        headers,
        "/notification",
      )("");
      expect(response.status).toBe(200);
      return ((await response.json()) as Array<{ type: string }>)
        .map((row) => row.type)
        .sort();
    }
    const key = async (permissions?: Record<string, string[]>) => ({
      "x-api-key": await keyFor(owner.id, permissions),
    });

    const all = sorted(
      "info",
      "time_off_member_away",
      "time_off_requested",
      "time_off_holiday_calendar_requested",
    );
    expect(await typesFor({})).toEqual(all);
    expect(await typesFor(await key())).toEqual(all);
    expect(
      await typesFor(await key({ workspace: ["read"], task: ["read"] })),
    ).toEqual(["info"]);
    expect(
      await typesFor(await key({ time_off: ["create", "approve"] })),
    ).toEqual(["info"]);
    expect(await typesFor(await key({ time_off: ["read"] }))).toEqual(
      sorted("info", "time_off_member_away"),
    );
    expect(
      await typesFor(await key({ time_off: ["read", "approve"] })),
    ).toEqual(all);
  });
});

describe("time off delivery", () => {
  it("delivers workspace time off to rules limited to selected projects, without type or note", async () => {
    const team = await createTimeOffTeam();
    const { owner, member, workspaceId } = team;
    await db.insert(schema.userNotificationPreferenceTable).values({
      userId: owner.id,
      emailEnabled: true,
      webhookEnabled: true,
      webhookUrl: "https://hooks.example/kaneo",
    });
    await db.insert(schema.userNotificationWorkspaceRuleTable).values({
      userId: owner.id,
      workspaceId,
      isActive: true,
      emailEnabled: true,
      webhookEnabled: true,
      projectMode: "selected",
    });
    const send = vi.mocked(email.sendNotificationEmail);
    const request = await requestTimeOff(team, member, {
      type: "public_holiday",
      note: "Dentist secret",
    });

    await vi.waitFor(() =>
      expect(sendOutboundRequest).toHaveBeenCalledTimes(1),
    );
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    const [url, init] = vi.mocked(sendOutboundRequest).mock.calls[0] ?? [];
    expect(url).toBe("https://hooks.example/kaneo");
    const body = String((init as { body: string }).body);
    expect(body).not.toContain("Dentist");
    expect(body).not.toContain('"public_holiday"');
    const payload = JSON.parse(body);
    expect(payload.notification).toMatchObject({
      type: "time_off_requested",
      title: `${member.name} requested time off`,
      resourceType: "workspace",
      resourceId: workspaceId,
    });
    expect(payload.notification.content).toContain("(5 working days)");
    expect(Object.keys(payload.notification.eventData).sort()).toEqual(
      sorted(
        "workspaceId",
        "timeOffId",
        "requesterId",
        "requesterName",
        "startDate",
        "endDate",
        "days",
      ),
    );
    expect(payload.notification.eventData.timeOffId).toBe(request.id);
    expect(payload.project).toBeNull();
    expect(payload.task).toBeNull();

    const [recipient, subject, message] = send.mock.calls[0] ?? [];
    expect(recipient).toBe(owner.email);
    expect(subject).toBe(`${member.name} requested time off`);
    expect(message).toMatchObject({
      actionUrl: expect.stringMatching(
        new RegExp(`/dashboard/workspace/${workspaceId}/time-off$`),
      ),
    });
    expect(JSON.stringify(message)).not.toContain("Dentist");
  });

  it("delivers holiday calendar requests and decisions without the country or region", async () => {
    const team = await createTimeOffTeam();
    const { owner, admin, member, workspaceId } = team;
    for (const [userId, url] of [
      [owner.id, "https://hooks.example/owner"],
      [member.id, "https://hooks.example/member"],
    ] as const) {
      await db.insert(schema.userNotificationPreferenceTable).values({
        userId,
        emailEnabled: true,
        webhookEnabled: true,
        webhookUrl: url,
      });
      await db.insert(schema.userNotificationWorkspaceRuleTable).values({
        userId,
        workspaceId,
        isActive: true,
        emailEnabled: true,
        webhookEnabled: true,
        projectMode: "selected",
      });
    }
    const send = vi.mocked(email.sendNotificationEmail);
    const outbound = vi.mocked(sendOutboundRequest);
    // Webhook payloads sent to one URL, parsed.
    const payloads = (url: string) =>
      outbound.mock.calls
        .filter(([to]) => to === url)
        .map(([, init]) => JSON.parse(String((init as { body: string }).body)));

    const request = await requestCalendarChange(team, member);
    await vi.waitFor(() =>
      expect(payloads("https://hooks.example/owner")).toHaveLength(1),
    );
    const [asked] = payloads("https://hooks.example/owner");
    expect(asked.notification).toMatchObject({
      type: "time_off_holiday_calendar_requested",
      title: `${member.name} asked to change their public holidays`,
      content: "A public holiday calendar change is waiting for your review.",
      resourceType: "workspace",
      resourceId: workspaceId,
      eventData: {
        workspaceId,
        requestId: request.id,
        requesterId: member.id,
        requesterName: member.name,
      },
    });
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        owner.email,
        `${member.name} asked to change their public holidays`,
        expect.objectContaining({
          actionUrl: expect.stringMatching(
            new RegExp(`/dashboard/workspace/${workspaceId}/time-off$`),
          ),
        }),
      ),
    );

    const approved = await team.as(admin)(
      `/workspace/${workspaceId}/holiday-calendar-requests/${request.id}/approve`,
      "POST",
      { version: request.version },
    );
    expect(approved.status).toBe(200);
    await vi.waitFor(() =>
      expect(payloads("https://hooks.example/member")).toHaveLength(1),
    );
    const [decided] = payloads("https://hooks.example/member");
    expect(decided.notification).toMatchObject({
      type: "time_off_holiday_calendar_approved",
      title: "Public holiday change approved",
      content: `${admin.name} approved your public holiday calendar change.`,
      eventData: { requestId: request.id, deciderId: admin.id },
    });
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        member.email,
        "Public holiday change approved",
        expect.anything(),
      ),
    );

    for (const [, init] of outbound.mock.calls)
      expect(String((init as { body: string }).body)).not.toMatch(
        CALENDAR_TEXT,
      );
    expect(JSON.stringify(send.mock.calls)).not.toMatch(CALENDAR_TEXT);
  });
});
