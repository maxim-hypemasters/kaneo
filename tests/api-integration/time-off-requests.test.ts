import { and, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";
import { addDays, insertTimeOff, mondayInWeeks } from "./helpers/time-off";
import {
  currentYear,
  saturdayFrom,
  todayUtc,
  weekdaysBetween,
} from "./helpers/time-off-days";
import {
  type Caller,
  createTimeOffTeam,
  type TimeOffTeam,
} from "./helpers/time-off-team";

vi.mock("../../apps/api/src/events", async (original) => {
  const { awaitEventHandlers } = await import("./helpers/await-event-handlers");
  return awaitEventHandlers(original);
});

beforeEach(resetTestDatabase);

// A Monday-to-Friday week `weeks` weeks out.
function week(weeks: number) {
  const startDate = mondayInWeeks(weeks);
  return { startDate, endDate: addDays(startDate, 4) };
}

async function create(
  caller: Caller,
  workspaceId: string,
  body: Record<string, unknown>,
) {
  const response = await caller(`/workspace/${workspaceId}`, "POST", {
    type: "vacation",
    ...body,
  });
  expect(response.status).toBe(200);
  return (await response.json()).request as {
    id: string;
    version: number;
    status: string;
    startDate: string;
    endDate: string;
  };
}

async function expectCode(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect((await response.json()).code).toBe(code);
}

async function statusOf(id: string) {
  const [row] = await db
    .select()
    .from(schema.timeOffTable)
    .where(eq(schema.timeOffTable.id, id));
  return row;
}

describe("time off request lifecycle", () => {
  it("creates pending, edits with version+1, approves and lets the requester cancel before it starts", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const member = team.as(team.member);
    const admin = team.as(team.admin);
    const range = week(3);

    const created = await member(`/workspace/${ws}`, "POST", {
      type: "vacation",
      ...range,
      note: "beach",
    });
    expect(created.status).toBe(200);
    const body = await created.json();
    expect(body.workspaceId).toBe(ws);
    expect(body.request).toMatchObject({
      workspaceId: ws,
      userId: team.member.id,
      type: "vacation",
      status: "pending",
      ...range,
      days: 5,
      note: "beach",
      version: 0,
      createdBy: team.member.id,
      statusChangedBy: null,
      canEdit: true,
      canCancel: true,
      canDecide: false,
    });
    expect(
      body.request.daysByYear.reduce(
        (sum: number, entry: { days: number }) => sum + entry.days,
        0,
      ),
    ).toBe(5);
    expect(body.balances.length).toBeGreaterThan(0);
    for (const balance of body.balances) {
      expect(balance.userId).toBe(team.member.id);
    }
    const id = body.request.id as string;

    const noted = await member(`/${id}`, "PATCH", { note: "beach house" });
    expect(noted.status).toBe(200);
    expect((await noted.json()).request).toMatchObject({
      status: "pending",
      note: "beach house",
      version: 1,
    });

    const shortened = await member(`/${id}`, "PATCH", {
      endDate: addDays(range.startDate, 3),
    });
    expect(shortened.status).toBe(200);
    expect((await shortened.json()).request).toMatchObject({
      status: "pending",
      days: 4,
      version: 2,
    });

    const reviewed = await admin(`/${id}`);
    expect(reviewed.status).toBe(200);
    expect(await reviewed.json()).toMatchObject({
      version: 2,
      canDecide: true,
      canEdit: true,
      canCancel: true,
    });

    const approved = await admin(`/${id}/approve`, "POST", { version: 2 });
    expect(approved.status).toBe(200);
    const approvedRequest = (await approved.json()).request;
    expect(approvedRequest).toMatchObject({
      status: "approved",
      version: 2,
      statusChangedBy: team.admin.id,
    });
    expect(approvedRequest.statusChangedAt).not.toBeNull();

    const own = await (await member(`/${id}`)).json();
    expect(own).toMatchObject({
      status: "approved",
      canEdit: false,
      canCancel: true,
      canDecide: false,
    });

    const cancelled = await member(`/${id}/cancel`, "POST");
    expect(cancelled.status).toBe(200);
    expect((await cancelled.json()).request).toMatchObject({
      status: "cancelled",
      statusChangedBy: team.member.id,
    });

    const history = await (
      await member(
        `/workspace/${ws}/requests?year=${range.startDate.slice(0, 4)}`,
      )
    ).json();
    expect(
      history.requests.map((request: { id: string; status: string }) => [
        request.id,
        request.status,
      ]),
    ).toEqual([[id, "cancelled"]]);
  });

  it("starts an approver's own request pending and lets them approve it", async () => {
    const team = await createTimeOffTeam();
    const admin = team.as(team.admin);
    const own = await create(admin, team.workspaceId, week(2));
    expect(own.status).toBe("pending");
    const approved = await admin(`/${own.id}/approve`, "POST", { version: 0 });
    expect(approved.status).toBe(200);
    expect((await approved.json()).request.status).toBe("approved");
  });

  it("declines a pending request", async () => {
    const team = await createTimeOffTeam();
    const pending = await create(
      team.as(team.member),
      team.workspaceId,
      week(2),
    );
    const declined = await team.as(team.owner)(
      `/${pending.id}/decline`,
      "POST",
      {
        version: 0,
      },
    );
    expect(declined.status).toBe(200);
    expect((await declined.json()).request).toMatchObject({
      status: "declined",
      statusChangedBy: team.owner.id,
    });
  });

  it("never creates anything but pending", async () => {
    const team = await createTimeOffTeam();
    const response = await team.as(team.owner)(
      `/workspace/${team.workspaceId}`,
      "POST",
      { type: "vacation", ...week(2), status: "approved" },
    );
    expect(response.status).toBe(400);
    expect(await db.select().from(schema.timeOffTable)).toHaveLength(0);
  });
});

describe("time off validation", () => {
  async function post(team: TimeOffTeam, body: Record<string, unknown>) {
    return team.as(team.member)(`/workspace/${team.workspaceId}`, "POST", {
      type: "vacation",
      ...body,
    });
  }

  it("rejects an end before the start", async () => {
    const team = await createTimeOffTeam();
    const { startDate, endDate } = week(2);
    expect(
      (await post(team, { startDate: endDate, endDate: startDate })).status,
    ).toBe(400);
  });

  it("allows 366 days and rejects 367", async () => {
    const team = await createTimeOffTeam();
    const startDate = `${currentYear() - 1}-01-04`;
    expect(
      (await post(team, { startDate, endDate: addDays(startDate, 366) }))
        .status,
    ).toBe(400);
    expect(
      (await post(team, { startDate, endDate: addDays(startDate, 365) }))
        .status,
    ).toBe(200);
  });

  it("keeps requests between Jan 1 of last year and Dec 31 of next year", async () => {
    const team = await createTimeOffTeam();
    const year = currentYear();
    expect(
      (
        await post(team, {
          startDate: `${year - 2}-12-27`,
          endDate: `${year - 1}-01-07`,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post(team, {
          startDate: `${year + 1}-12-27`,
          endDate: `${year + 2}-01-07`,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post(team, {
          startDate: `${year - 1}-01-01`,
          endDate: `${year - 1}-01-07`,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(team, {
          startDate: `${year + 1}-12-25`,
          endDate: `${year + 1}-12-31`,
        })
      ).status,
    ).toBe(200);
  });

  it("rejects a range with no weekday", async () => {
    const team = await createTimeOffTeam();
    const saturday = saturdayFrom(mondayInWeeks(2));
    expect(
      (await post(team, { startDate: saturday, endDate: addDays(saturday, 1) }))
        .status,
    ).toBe(400);
    expect(
      (await post(team, { startDate: saturday, endDate: saturday })).status,
    ).toBe(400);
    expect(
      (await post(team, { startDate: saturday, endDate: addDays(saturday, 2) }))
        .status,
    ).toBe(200);
  });

  it("limits the note to 500 characters after trimming", async () => {
    const team = await createTimeOffTeam();
    expect(
      (await post(team, { ...week(2), note: "x".repeat(501) })).status,
    ).toBe(400);
    const ok = await post(team, { ...week(3), note: `  ${"y".repeat(500)}  ` });
    expect(ok.status).toBe(200);
    expect((await ok.json()).request.note).toBe("y".repeat(500));
  });

  it("rejects malformed dates, unknown types and unknown fields", async () => {
    const team = await createTimeOffTeam();
    const year = currentYear();
    expect(
      (
        await post(team, {
          startDate: `${year}-13-01`,
          endDate: `${year}-13-02`,
        })
      ).status,
    ).toBe(400);
    expect((await post(team, { ...week(2), type: "sabbatical" })).status).toBe(
      400,
    );
    for (const removed of ["personal", "other"])
      expect((await post(team, { ...week(2), type: removed })).status).toBe(
        400,
      );
    expect((await post(team, { ...week(2), extra: true })).status).toBe(400);
  });

  it("limits the calendar window to 366 days", async () => {
    const team = await createTimeOffTeam();
    const from = `${currentYear()}-01-01`;
    const viewer = team.as(team.viewer);
    expect(
      (
        await viewer(
          `/workspace/${team.workspaceId}?from=${from}&to=${addDays(from, 366)}`,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await viewer(
          `/workspace/${team.workspaceId}?from=${from}&to=${addDays(from, 365)}`,
        )
      ).status,
    ).toBe(200);
  });

  it("checks date order on the merged values of an edit", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    const range = week(3);
    const pending = await create(member, team.workspaceId, range);
    expect(
      (
        await member(`/${pending.id}`, "PATCH", {
          endDate: addDays(range.startDate, -1),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await member(`/${pending.id}`, "PATCH", {
          startDate: addDays(range.endDate, 1),
        })
      ).status,
    ).toBe(400);
    expect(await statusOf(pending.id)).toMatchObject({ ...range, version: 0 });
  });

  it("runs the window and weekday checks on an edit only when dates change", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    const year = currentYear();
    const old = await insertTimeOff({
      workspaceId: team.workspaceId,
      userId: team.member.id,
      startDate: `${year - 2}-03-02`,
      endDate: `${year - 2}-03-06`,
    });
    const saturday = saturdayFrom(mondayInWeeks(4));
    const weekend = await insertTimeOff({
      workspaceId: team.workspaceId,
      userId: team.member.id,
      startDate: saturday,
      endDate: addDays(saturday, 1),
    });

    const renamed = await member(`/${old.id}`, "PATCH", { note: "fixed" });
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).request).toMatchObject({
      note: "fixed",
      version: 1,
    });
    expect((await member(`/${old.id}`, "PATCH", { type: "sick" })).status).toBe(
      200,
    );
    expect(
      (await member(`/${old.id}`, "PATCH", { endDate: `${year - 2}-03-05` }))
        .status,
    ).toBe(400);

    expect(
      (await member(`/${weekend.id}`, "PATCH", { type: "public_holiday" }))
        .status,
    ).toBe(200);
    expect(
      (await member(`/${weekend.id}`, "PATCH", { endDate: saturday })).status,
    ).toBe(400);
  });

  it("rejects an empty edit and unknown edit fields", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    const pending = await create(member, team.workspaceId, week(2));
    expect((await member(`/${pending.id}`, "PATCH", {})).status).toBe(400);
    expect(
      (await member(`/${pending.id}`, "PATCH", { status: "approved" })).status,
    ).toBe(400);
    expect((await statusOf(pending.id))?.status).toBe("pending");
  });
});

describe("time off overlap", () => {
  it("treats a shared boundary day as overlap and the next day as free", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    const ws = team.workspaceId;
    const range = week(3);
    await create(member, ws, range);

    await expectCode(
      await member(`/workspace/${ws}`, "POST", {
        type: "vacation",
        startDate: range.endDate,
        endDate: addDays(range.endDate, 3),
      }),
      409,
      "TIME_OFF_OVERLAP",
    );
    await expectCode(
      await member(`/workspace/${ws}`, "POST", {
        type: "sick",
        startDate: addDays(range.startDate, -3),
        endDate: range.startDate,
      }),
      409,
      "TIME_OFF_OVERLAP",
    );
    await expectCode(
      await member(`/workspace/${ws}`, "POST", {
        type: "public_holiday",
        startDate: addDays(range.startDate, 1),
        endDate: addDays(range.startDate, 2),
      }),
      409,
      "TIME_OFF_OVERLAP",
    );
    // The range runs Monday to Friday, so end+1 and start-1 are weekend days;
    // each adjacent request reaches one weekday beyond them.
    const dayAfter = await member(`/workspace/${ws}`, "POST", {
      type: "vacation",
      startDate: addDays(range.endDate, 1),
      endDate: addDays(range.endDate, 3),
    });
    expect(dayAfter.status).toBe(200);
    const dayBefore = await member(`/workspace/${ws}`, "POST", {
      type: "vacation",
      startDate: addDays(range.startDate, -3),
      endDate: addDays(range.startDate, -1),
    });
    expect(dayBefore.status).toBe(200);
  });

  it("blocks on approved days but not on declined or cancelled ones, and only for the same member", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const member = team.as(team.member);
    const approved = week(2);
    const declined = week(4);
    const cancelled = week(6);
    await insertTimeOff({
      workspaceId: ws,
      userId: team.member.id,
      ...approved,
      status: "approved",
    });
    await insertTimeOff({
      workspaceId: ws,
      userId: team.member.id,
      ...declined,
      status: "declined",
    });
    await insertTimeOff({
      workspaceId: ws,
      userId: team.member.id,
      ...cancelled,
      status: "cancelled",
    });

    await expectCode(
      await member(`/workspace/${ws}`, "POST", {
        type: "vacation",
        ...approved,
      }),
      409,
      "TIME_OFF_OVERLAP",
    );
    expect(
      (
        await member(`/workspace/${ws}`, "POST", {
          type: "vacation",
          ...declined,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await member(`/workspace/${ws}`, "POST", {
          type: "vacation",
          ...cancelled,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await team.as(team.colleague)(`/workspace/${ws}`, "POST", {
          type: "vacation",
          ...approved,
        })
      ).status,
    ).toBe(200);
  });

  it("checks overlap on edits, excluding the request itself", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const member = team.as(team.member);
    const first = await create(member, ws, week(2));
    const second = await create(member, ws, week(4));

    expect(
      (
        await member(`/${second.id}`, "PATCH", {
          startDate: addDays(second.startDate, 1),
        })
      ).status,
    ).toBe(200);
    await expectCode(
      await member(`/${second.id}`, "PATCH", { startDate: first.endDate }),
      409,
      "TIME_OFF_OVERLAP",
    );
  });

  it("lets exactly one of two parallel identical requests through", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const member = team.as(team.member);
    const range = week(3);
    const responses = await Promise.all([
      member(`/workspace/${ws}`, "POST", { type: "vacation", ...range }),
      member(`/workspace/${ws}`, "POST", { type: "sick", ...range }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const loser = responses.find((response) => response.status === 409)!;
    expect((await loser.json()).code).toBe("TIME_OFF_OVERLAP");
    expect(
      await db
        .select()
        .from(schema.timeOffTable)
        .where(eq(schema.timeOffTable.userId, team.member.id)),
    ).toHaveLength(1);
  });

  it("lets exactly one of two parallel overlapping requests through", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const member = team.as(team.member);
    const range = week(5);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const startDate = addDays(range.startDate, attempt * 14);
      const responses = await Promise.all([
        member(`/workspace/${ws}`, "POST", {
          type: "vacation",
          startDate,
          endDate: addDays(startDate, 2),
        }),
        member(`/workspace/${ws}`, "POST", {
          type: "vacation",
          startDate: addDays(startDate, 2),
          endDate: addDays(startDate, 4),
        }),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
    }
    expect(
      await db
        .select()
        .from(schema.timeOffTable)
        .where(eq(schema.timeOffTable.userId, team.member.id)),
    ).toHaveLength(3);
  });
});

describe("deciding time off", () => {
  it("refuses a second approval", async () => {
    const team = await createTimeOffTeam();
    const pending = await create(
      team.as(team.member),
      team.workspaceId,
      week(2),
    );
    const admin = team.as(team.admin);
    expect(
      (await admin(`/${pending.id}/approve`, "POST", { version: 0 })).status,
    ).toBe(200);
    await expectCode(
      await team.as(team.owner)(`/${pending.id}/approve`, "POST", {
        version: 0,
      }),
      409,
      "TIME_OFF_STATUS",
    );
    await expectCode(
      await admin(`/${pending.id}/decline`, "POST", { version: 0 }),
      409,
      "TIME_OFF_STATUS",
    );
  });

  it("lets exactly one of two parallel decisions win", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const pending = await create(
        member,
        team.workspaceId,
        week(2 + attempt * 2),
      );
      const responses = await Promise.all([
        team.as(team.admin)(`/${pending.id}/approve`, "POST", { version: 0 }),
        team.as(team.owner)(`/${pending.id}/decline`, "POST", { version: 0 }),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      const winner = responses[0]?.status === 200 ? "approved" : "declined";
      expect((await statusOf(pending.id))?.status).toBe(winner);
    }
  });

  it("refuses a decision made on a stale version", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    const admin = team.as(team.admin);
    const pending = await create(member, team.workspaceId, week(2));
    expect(
      (await member(`/${pending.id}`, "PATCH", { note: "updated" })).status,
    ).toBe(200);

    await expectCode(
      await admin(`/${pending.id}/approve`, "POST", { version: 0 }),
      409,
      "TIME_OFF_CHANGED",
    );
    await expectCode(
      await admin(`/${pending.id}/decline`, "POST", { version: 0 }),
      409,
      "TIME_OFF_CHANGED",
    );
    await expectCode(
      await admin(`/${pending.id}/approve`, "POST", { version: 7 }),
      409,
      "TIME_OFF_CHANGED",
    );
    expect((await statusOf(pending.id))?.status).toBe("pending");
    expect(
      (await admin(`/${pending.id}/approve`, "POST", { version: 1 })).status,
    ).toBe(200);
  });

  it("requires the reviewed version", async () => {
    const team = await createTimeOffTeam();
    const pending = await create(
      team.as(team.member),
      team.workspaceId,
      week(2),
    );
    expect(
      (await team.as(team.admin)(`/${pending.id}/approve`, "POST", {})).status,
    ).toBe(400);
    expect((await statusOf(pending.id))?.status).toBe("pending");
  });

  it("settles a cancel racing an approval on started time off with one winner", async () => {
    const team = await createTimeOffTeam();
    const today = todayUtc();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      // Started, pending requests in separate weeks so they never overlap.
      const startDate = addDays(today, -3 - attempt * 14);
      const row = await insertTimeOff({
        workspaceId: team.workspaceId,
        userId: team.member.id,
        startDate,
        endDate: addDays(startDate, 6),
      });
      const [cancel, approve] = await Promise.all([
        team.as(team.member)(`/${row.id}/cancel`, "POST"),
        team.as(team.admin)(`/${row.id}/approve`, "POST", { version: 0 }),
      ]);
      expect([cancel.status, approve.status].sort()).toEqual([200, 409]);
      const final = (await statusOf(row.id))?.status;
      expect(final).toBe(cancel.status === 200 ? "cancelled" : "approved");
    }
  });

  it("settles an edit racing an approval with one winner", async () => {
    const team = await createTimeOffTeam();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const range = week(2 + attempt * 2);
      const pending = await create(
        team.as(team.member),
        team.workspaceId,
        range,
      );
      const [edit, approve] = await Promise.all([
        team.as(team.member)(`/${pending.id}`, "PATCH", {
          endDate: addDays(range.startDate, 1),
        }),
        team.as(team.admin)(`/${pending.id}/approve`, "POST", { version: 0 }),
      ]);
      expect([edit.status, approve.status].sort()).toEqual([200, 409]);
      const row = await statusOf(pending.id);
      if (approve.status === 200) {
        expect(row).toMatchObject({
          status: "approved",
          version: 0,
          endDate: range.endDate,
        });
      } else {
        expect((await approve.json()).code).toBe("TIME_OFF_CHANGED");
        expect(row).toMatchObject({
          status: "pending",
          version: 1,
          endDate: addDays(range.startDate, 1),
        });
      }
    }
  });
});

describe("editing approved time off", () => {
  it("refuses the requester and keeps the request unchanged", async () => {
    const team = await createTimeOffTeam();
    const range = week(3);
    const row = await insertTimeOff({
      workspaceId: team.workspaceId,
      userId: team.member.id,
      ...range,
      status: "approved",
    });
    await expectCode(
      await team.as(team.member)(`/${row.id}`, "PATCH", { note: "longer" }),
      409,
      "TIME_OFF_STATUS",
    );
    await expectCode(
      await team.as(team.member)(`/${row.id}`, "PATCH", {
        endDate: addDays(range.endDate, 3),
      }),
      409,
      "TIME_OFF_STATUS",
    );
    expect(await statusOf(row.id)).toMatchObject({
      ...range,
      status: "approved",
      version: 0,
      note: null,
    });
  });

  it("lets an approver end it early or fix it, and it stays approved", async () => {
    const team = await createTimeOffTeam();
    const range = week(3);
    const row = await insertTimeOff({
      workspaceId: team.workspaceId,
      userId: team.member.id,
      ...range,
      status: "approved",
    });
    const admin = team.as(team.admin);

    const shortened = await admin(`/${row.id}`, "PATCH", {
      endDate: addDays(range.startDate, 1),
    });
    expect(shortened.status).toBe(200);
    expect((await shortened.json()).request).toMatchObject({
      status: "approved",
      version: 1,
      days: 2,
      endDate: addDays(range.startDate, 1),
    });

    const retyped = await admin(`/${row.id}`, "PATCH", {
      type: "sick",
      note: "flu",
    });
    expect(retyped.status).toBe(200);
    expect((await retyped.json()).request).toMatchObject({
      status: "approved",
      version: 2,
      type: "sick",
      note: "flu",
    });
  });

  it("checks overlap when an approver moves approved time off", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const first = week(2);
    const second = week(4);
    await insertTimeOff({
      workspaceId: ws,
      userId: team.member.id,
      ...first,
      status: "pending",
    });
    const row = await insertTimeOff({
      workspaceId: ws,
      userId: team.member.id,
      ...second,
      status: "approved",
    });
    await expectCode(
      await team.as(team.owner)(`/${row.id}`, "PATCH", {
        startDate: first.endDate,
      }),
      409,
      "TIME_OFF_OVERLAP",
    );
  });
});

describe("cancelling time off", () => {
  it("refuses the requester once approved time off has started, but not an approver", async () => {
    const team = await createTimeOffTeam();
    const today = todayUtc();
    const started = await insertTimeOff({
      workspaceId: team.workspaceId,
      userId: team.member.id,
      startDate: addDays(today, -2),
      endDate: addDays(today, 4),
      status: "approved",
    });
    const refused = await team.as(team.member)(`/${started.id}/cancel`, "POST");
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe("TIME_OFF_STARTED");
    expect((await statusOf(started.id))?.status).toBe("approved");

    const byApprover = await team.as(team.admin)(
      `/${started.id}/cancel`,
      "POST",
    );
    expect(byApprover.status).toBe(200);
    expect((await byApprover.json()).request).toMatchObject({
      status: "cancelled",
      statusChangedBy: team.admin.id,
    });
  });

  it("lets the requester cancel approved time off that starts today", async () => {
    const team = await createTimeOffTeam();
    const today = todayUtc();
    const row = await insertTimeOff({
      workspaceId: team.workspaceId,
      userId: team.member.id,
      startDate: today,
      endDate: addDays(today, 6),
      status: "approved",
    });
    expect(
      (await team.as(team.member)(`/${row.id}/cancel`, "POST")).status,
    ).toBe(200);
    expect((await statusOf(row.id))?.status).toBe("cancelled");
  });

  it("lets the requester cancel a pending request even after it started", async () => {
    const team = await createTimeOffTeam();
    const today = todayUtc();
    const row = await insertTimeOff({
      workspaceId: team.workspaceId,
      userId: team.member.id,
      startDate: addDays(today, -2),
      endDate: addDays(today, 4),
    });
    expect(
      (await team.as(team.member)(`/${row.id}/cancel`, "POST")).status,
    ).toBe(200);
  });
});

describe("terminal time off", () => {
  it.each(["declined", "cancelled"] as const)(
    "refuses every action on %s requests",
    async (status) => {
      const team = await createTimeOffTeam();
      const range = week(3);
      const row = await insertTimeOff({
        workspaceId: team.workspaceId,
        userId: team.member.id,
        ...range,
        status,
      });
      for (const caller of [team.as(team.member), team.as(team.admin)]) {
        await expectCode(
          await caller(`/${row.id}`, "PATCH", { note: "again" }),
          409,
          "TIME_OFF_STATUS",
        );
        await expectCode(
          await caller(`/${row.id}/cancel`, "POST"),
          409,
          "TIME_OFF_STATUS",
        );
      }
      for (const action of ["approve", "decline"]) {
        await expectCode(
          await team.as(team.owner)(`/${row.id}/${action}`, "POST", {
            version: 0,
          }),
          409,
          "TIME_OFF_STATUS",
        );
      }
      expect(await statusOf(row.id)).toMatchObject({
        status,
        version: 0,
        note: null,
      });
    },
  );
});

describe("recording time off for another member", () => {
  it("needs approve", async () => {
    const team = await createTimeOffTeam();
    const response = await team.as(team.member)(
      `/workspace/${team.workspaceId}`,
      "POST",
      {
        userId: team.colleague.id,
        type: "sick",
        ...week(2),
      },
    );
    expect(response.status).toBe(403);
    expect(await db.select().from(schema.timeOffTable)).toHaveLength(0);
  });

  it("creates a pending request for a current member, recorded by the approver", async () => {
    const team = await createTimeOffTeam();
    const range = week(2);
    const response = await team.as(team.admin)(
      `/workspace/${team.workspaceId}`,
      "POST",
      {
        userId: team.member.id,
        type: "sick",
        ...range,
      },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.request).toMatchObject({
      userId: team.member.id,
      createdBy: team.admin.id,
      status: "pending",
      canDecide: true,
    });
    for (const balance of body.balances) {
      expect(balance.userId).toBe(team.member.id);
    }
    expect(
      (
        await team.as(team.admin)(`/${body.request.id}/approve`, "POST", {
          version: 0,
        })
      ).status,
    ).toBe(200);
  });

  it("refuses a target who is not a current member", async () => {
    const team = await createTimeOffTeam();
    const outsider = await createWorkspaceMember({ role: "owner" });
    const admin = team.as(team.admin);
    for (const userId of [outsider.user.id, "user-that-does-not-exist"]) {
      const response = await admin(`/workspace/${team.workspaceId}`, "POST", {
        userId,
        type: "vacation",
        ...week(2),
      });
      expect(response.status).toBe(404);
    }

    await db
      .delete(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, team.workspaceId),
          eq(schema.workspaceUserTable.userId, team.colleague.id),
        ),
      );
    const removed = await admin(`/workspace/${team.workspaceId}`, "POST", {
      userId: team.colleague.id,
      type: "vacation",
      ...week(2),
    });
    expect(removed.status).toBe(404);
    expect(
      await db
        .select()
        .from(schema.timeOffTable)
        .where(
          inArray(schema.timeOffTable.userId, [
            outsider.user.id,
            team.colleague.id,
          ]),
        ),
    ).toHaveLength(0);
  });

  it("counts every weekday of the recorded range", async () => {
    const team = await createTimeOffTeam();
    const startDate = mondayInWeeks(2);
    const endDate = addDays(startDate, 11);
    const response = await team.as(team.owner)(
      `/workspace/${team.workspaceId}`,
      "POST",
      {
        userId: team.member.id,
        type: "sick",
        startDate,
        endDate,
      },
    );
    expect((await response.json()).request.days).toBe(
      weekdaysBetween(startDate, endDate),
    );
  });
});

describe("listing time off", () => {
  it("lists requests of every status that touch the year", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const userId = team.member.id;
    const year = currentYear();
    const row = (startDate: string, endDate: string, status: string) =>
      insertTimeOff({
        workspaceId: ws,
        userId,
        startDate,
        endDate,
        status: status as "pending",
      });
    const lastYear = await row(
      `${year - 1}-06-01`,
      `${year - 1}-06-05`,
      "approved",
    );
    const declined = await row(`${year}-03-02`, `${year}-03-06`, "declined");
    const cancelled = await row(`${year}-04-01`, `${year}-04-03`, "cancelled");
    const pending = await row(`${year}-05-04`, `${year}-05-08`, "pending");
    const crossing = await row(
      `${year}-12-28`,
      `${year + 1}-01-08`,
      "approved",
    );
    const nextYear = await row(
      `${year + 1}-06-01`,
      `${year + 1}-06-05`,
      "pending",
    );
    await insertTimeOff({
      workspaceId: ws,
      userId: team.colleague.id,
      startDate: `${year}-05-04`,
      endDate: `${year}-05-08`,
    });

    const ids = async (path: string, caller = team.as(team.member)) => {
      const response = await caller(path);
      expect(response.status).toBe(200);
      return (await response.json()).requests
        .map((request: { id: string }) => request.id)
        .sort();
    };
    const thisYear = [
      declined.id,
      cancelled.id,
      pending.id,
      crossing.id,
    ].sort();
    expect(await ids(`/workspace/${ws}/requests`)).toEqual(thisYear);
    expect(await ids(`/workspace/${ws}/requests?year=${year}`)).toEqual(
      thisYear,
    );
    expect(await ids(`/workspace/${ws}/requests?year=${year - 1}`)).toEqual([
      lastYear.id,
    ]);
    expect(await ids(`/workspace/${ws}/requests?year=${year + 1}`)).toEqual(
      [crossing.id, nextYear.id].sort(),
    );
    expect(
      await ids(
        `/workspace/${ws}/requests?userId=${userId}&year=${year}`,
        team.as(team.admin),
      ),
    ).toEqual(thisYear);
  });

  it("returns calendar entries that overlap the window, boundary days included", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const from = mondayInWeeks(4);
    const to = addDays(from, 13);
    const approved = (userId: string, startDate: string, endDate: string) =>
      insertTimeOff({
        workspaceId: ws,
        userId,
        startDate,
        endDate,
        status: "approved",
      });
    const endsOnFrom = await approved(team.member.id, addDays(from, -3), from);
    const startsOnTo = await approved(team.member.id, to, addDays(to, 3));
    await approved(team.member.id, addDays(from, -10), addDays(from, -4));
    await approved(team.member.id, addDays(to, 4), addDays(to, 8));
    const spanning = await approved(
      team.colleague.id,
      addDays(from, -10),
      addDays(to, 10),
    );

    const { entries } = await (
      await team.as(team.viewer)(`/workspace/${ws}?from=${from}&to=${to}`)
    ).json();
    expect(entries.map((entry: { id: string }) => entry.id).sort()).toEqual(
      [endsOnFrom.id, startsOnTo.id, spanning.id].sort(),
    );
  });
});

describe("time off action flags", () => {
  async function flags(caller: Caller, id: string) {
    const response = await caller(`/${id}`);
    expect(response.status).toBe(200);
    const { canEdit, canCancel, canDecide } = await response.json();
    return { canEdit, canCancel, canDecide };
  }

  it("mirror the transitions for the requester and for an approver", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const today = todayUtc();
    const member = team.as(team.member);
    const admin = team.as(team.admin);
    const insert = (
      startDate: string,
      status: "pending" | "approved" | "declined",
    ) =>
      insertTimeOff({
        workspaceId: ws,
        userId: team.member.id,
        startDate,
        endDate: addDays(startDate, 6),
        status,
      });
    const pending = await insert(addDays(today, 14), "pending");
    const upcoming = await insert(addDays(today, 28), "approved");
    const started = await insert(addDays(today, -2), "approved");
    const declined = await insert(addDays(today, 42), "declined");

    expect(await flags(member, pending.id)).toEqual({
      canEdit: true,
      canCancel: true,
      canDecide: false,
    });
    expect(await flags(admin, pending.id)).toEqual({
      canEdit: true,
      canCancel: true,
      canDecide: true,
    });
    expect(await flags(member, upcoming.id)).toEqual({
      canEdit: false,
      canCancel: true,
      canDecide: false,
    });
    expect(await flags(admin, upcoming.id)).toEqual({
      canEdit: true,
      canCancel: true,
      canDecide: false,
    });
    expect(await flags(member, started.id)).toEqual({
      canEdit: false,
      canCancel: false,
      canDecide: false,
    });
    expect(await flags(admin, started.id)).toEqual({
      canEdit: true,
      canCancel: true,
      canDecide: false,
    });
    expect(await flags(member, declined.id)).toEqual({
      canEdit: false,
      canCancel: false,
      canDecide: false,
    });
    expect(await flags(admin, declined.id)).toEqual({
      canEdit: false,
      canCancel: false,
      canDecide: false,
    });
  });

  it("give a requester without time_off:create nothing to do on their own request", async () => {
    const team = await createTimeOffTeam();
    const recorded = await team.as(team.admin)(
      `/workspace/${team.workspaceId}`,
      "POST",
      {
        userId: team.viewer.id,
        type: "sick",
        ...week(2),
      },
    );
    expect(recorded.status).toBe(200);
    const { id } = (await recorded.json()).request;
    const viewer = team.as(team.viewer);
    expect(await flags(viewer, id)).toEqual({
      canEdit: false,
      canCancel: false,
      canDecide: false,
    });
    expect((await viewer(`/${id}/cancel`, "POST")).status).toBe(403);
    expect((await viewer(`/${id}`, "PATCH", { note: "x" })).status).toBe(403);
  });
});
