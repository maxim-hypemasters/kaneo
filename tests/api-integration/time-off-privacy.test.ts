import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createInstanceAdmin } from "./helpers/admin/create-instance-admin";
import { resetTestDatabase } from "./helpers/database";
import { addDays, insertTimeOff, mondayInWeeks } from "./helpers/time-off";
import { currentYear } from "./helpers/time-off-days";
import {
  callerFor,
  createTimeOffTeam,
  type TimeOffTeam,
} from "./helpers/time-off-team";

vi.mock("../../apps/api/src/events", async (original) => {
  const { awaitEventHandlers } = await import("./helpers/await-event-handlers");
  return awaitEventHandlers(original);
});

beforeEach(resetTestDatabase);

const REDACTED_KEYS = ["endDate", "id", "startDate", "userId"];
const REQUEST_KEYS = [
  "canCancel",
  "canDecide",
  "canEdit",
  "createdAt",
  "createdBy",
  "days",
  "daysByYear",
  "endDate",
  "id",
  "note",
  "startDate",
  "status",
  "statusChangedAt",
  "statusChangedBy",
  "type",
  "updatedAt",
  "userId",
  "version",
  "workspaceId",
];
// Words that would only reach a colleague through the member's private
// fields: their notes, types and statuses.
const PRIVATE =
  /surgery|dentist|"sick"|"public_holiday"|"approved"|"pending"|"note"|"type"|"status"/;

function week(weeks: number) {
  const startDate = mondayInWeeks(weeks);
  return { startDate, endDate: addDays(startDate, 4) };
}

type Entry = Record<string, unknown> & { id: string; userId: string };

// The member has approved sick leave (note "surgery") and a pending public
// holiday (note "dentist"), both made through the API.
async function seedPrivateTimeOff(team: TimeOffTeam) {
  const ws = team.workspaceId;
  const member = team.as(team.member);
  const approvedRange = week(2);
  const pendingRange = week(4);
  const sick = await (
    await member(`/workspace/${ws}`, "POST", {
      type: "sick",
      ...approvedRange,
      note: "surgery",
    })
  ).json();
  expect(
    (
      await team.as(team.admin)(`/${sick.request.id}/approve`, "POST", {
        version: 0,
      })
    ).status,
  ).toBe(200);
  const holiday = await (
    await member(`/workspace/${ws}`, "POST", {
      type: "public_holiday",
      ...pendingRange,
      note: "dentist",
    })
  ).json();
  return {
    approvedId: sick.request.id as string,
    pendingId: holiday.request.id as string,
    approvedRange,
    pendingRange,
    window: `from=${addDays(approvedRange.startDate, -7)}&to=${addDays(pendingRange.endDate, 7)}`,
  };
}

describe("time off privacy", () => {
  it("shows other members only who and when, for approved entries", async () => {
    const team = await createTimeOffTeam();
    const seeded = await seedPrivateTimeOff(team);

    for (const person of [team.colleague, team.viewer]) {
      const response = await team.as(person)(
        `/workspace/${team.workspaceId}?${seeded.window}`,
      );
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toMatch(PRIVATE);
      const { entries } = JSON.parse(text) as { entries: Entry[] };
      expect(entries).toEqual([
        {
          id: seeded.approvedId,
          userId: team.member.id,
          ...seeded.approvedRange,
        },
      ]);
      expect(Object.keys(entries[0] ?? {}).sort()).toEqual(REDACTED_KEYS);
    }
  });

  it("shows the person their own entries and approvers everyone's in full", async () => {
    const team = await createTimeOffTeam();
    const seeded = await seedPrivateTimeOff(team);

    for (const person of [team.member, team.admin, team.owner]) {
      const { entries } = (await (
        await team.as(person)(`/workspace/${team.workspaceId}?${seeded.window}`)
      ).json()) as { entries: Entry[] };
      const byId = new Map(entries.map((entry) => [entry.id, entry]));
      expect([...byId.keys()].sort()).toEqual(
        [seeded.approvedId, seeded.pendingId].sort(),
      );
      for (const entry of entries) {
        expect(Object.keys(entry).sort()).toEqual(REQUEST_KEYS);
      }
      expect(byId.get(seeded.approvedId)).toMatchObject({
        type: "sick",
        status: "approved",
        note: "surgery",
      });
      expect(byId.get(seeded.pendingId)).toMatchObject({
        type: "public_holiday",
        status: "pending",
        note: "dentist",
      });
    }
  });

  it("keeps a colleague's own entries full beside redacted ones", async () => {
    const team = await createTimeOffTeam();
    const seeded = await seedPrivateTimeOff(team);
    const colleague = team.as(team.colleague);
    const own = await (
      await colleague(`/workspace/${team.workspaceId}`, "POST", {
        type: "vacation",
        ...seeded.approvedRange,
      })
    ).json();

    const { entries } = (await (
      await colleague(`/workspace/${team.workspaceId}?${seeded.window}`)
    ).json()) as { entries: Entry[] };
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    expect([...byId.keys()].sort()).toEqual(
      [seeded.approvedId, own.request.id].sort(),
    );
    expect(Object.keys(byId.get(seeded.approvedId) ?? {}).sort()).toEqual(
      REDACTED_KEYS,
    );
    expect(Object.keys(byId.get(own.request.id) ?? {}).sort()).toEqual(
      REQUEST_KEYS,
    );
  });

  it("leaves declined and cancelled time off off the calendar, even your own", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    await insertTimeOff({
      workspaceId: ws,
      userId: team.member.id,
      ...week(2),
      status: "declined",
    });
    await insertTimeOff({
      workspaceId: ws,
      userId: team.member.id,
      ...week(3),
      status: "cancelled",
    });
    const window = `from=${mondayInWeeks(1)}&to=${mondayInWeeks(5)}`;
    for (const person of [team.member, team.colleague, team.admin]) {
      const { entries } = await (
        await team.as(person)(`/workspace/${ws}?${window}`)
      ).json();
      expect(entries).toEqual([]);
    }
  });

  it("never sends a colleague the member's type, note or status from any route", async () => {
    const team = await createTimeOffTeam();
    const seeded = await seedPrivateTimeOff(team);
    const ws = team.workspaceId;
    const colleague = team.as(team.colleague);
    const year = currentYear();

    const responses = [
      await colleague(`/workspace/${ws}?${seeded.window}`),
      await colleague(`/workspace/${ws}/requests?userId=${team.member.id}`),
      await colleague(
        `/workspace/${ws}/requests?userId=${team.member.id}&year=${year + 1}`,
      ),
      await colleague(`/workspace/${ws}/balance?userId=${team.member.id}`),
      await colleague(`/workspace/${ws}/pending`),
      await colleague(`/workspace/${ws}/balances`),
      await colleague(`/${seeded.approvedId}`),
      await colleague(`/${seeded.pendingId}`),
      await colleague(`/${seeded.approvedId}`, "PATCH", { note: "peek" }),
      await colleague(`/${seeded.pendingId}/cancel`, "POST"),
      await colleague(`/${seeded.pendingId}/approve`, "POST", { version: 0 }),
      await colleague(`/${seeded.pendingId}/decline`, "POST", { version: 0 }),
    ];
    for (const response of responses) {
      expect(await response.text()).not.toMatch(
        /surgery|dentist|"sick"|"public_holiday"/,
      );
    }

    // Notifications created by the request and approval, read by the colleague
    // and stored for anyone, carry who and when only.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const inbox = await callerFor(
      team.app,
      team.colleague.id,
      {},
      "/notification",
    )("");
    expect(await inbox.text()).not.toMatch(
      /surgery|dentist|"sick"|"public_holiday"/,
    );
    const stored = await db.select().from(schema.notificationTable);
    expect(JSON.stringify(stored)).not.toMatch(
      /surgery|dentist|"sick"|"public_holiday"/,
    );

    const rows = await db.select().from(schema.timeOffTable);
    expect(rows.map((row) => [row.id, row.status, row.note]).sort()).toEqual(
      [
        [seeded.approvedId, "approved", "surgery"],
        [seeded.pendingId, "pending", "dentist"],
      ].sort(),
    );
  });

  it("shows a colleague's calendar holidays as who and when only", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const next = currentYear() + 1;
    expect(
      (
        await team.as(team.member)(`/workspace/${ws}/holiday-calendar`, "PUT", {
          country: "DE",
          region: "BY",
        })
      ).status,
    ).toBe(200);
    const window = `from=${next}-01-01&to=${next}-01-31&lang=de`;
    // Holiday names (English and German), the country and the region.
    const CALENDAR =
      /Neujahr|New Year|Heilige|Epiphany|Germany|Deutschland|Bavaria|Bayern|"DE"|"BY"|"name"/;

    for (const person of [team.colleague, team.viewer]) {
      const response = await team.as(person)(`/workspace/${ws}?${window}`);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toMatch(CALENDAR);
      const { holidays } = JSON.parse(text) as {
        holidays: Array<Record<string, unknown>>;
      };
      expect(holidays).toContainEqual({
        userId: team.member.id,
        date: `${next}-01-06`,
      });
      for (const holiday of holidays)
        expect(Object.keys(holiday).sort()).toEqual(["date", "userId"]);
      // Their own calendar routes never reveal the member's either.
      for (const path of [
        `/workspace/${ws}/holidays?userId=${team.member.id}&year=${next}`,
        `/workspace/${ws}/holidays?year=${next}`,
      ]) {
        expect(await (await team.as(person)(path)).text()).not.toMatch(
          CALENDAR,
        );
      }
    }

    for (const person of [team.member, team.admin, team.owner]) {
      const { holidays } = (await (
        await team.as(person)(`/workspace/${ws}?${window}`)
      ).json()) as { holidays: Array<Record<string, unknown>> };
      expect(holidays).toContainEqual({
        userId: team.member.id,
        date: `${next}-01-01`,
        name: "Neujahr",
      });
    }
  });

  it("keeps a member's calendar request from colleagues and viewers", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const next = currentYear() + 1;
    const member = team.as(team.member);
    const path = `/workspace/${ws}/holiday-calendar`;
    expect(
      (await member(path, "PUT", { country: "DE", region: "BY" })).status,
    ).toBe(200);
    const pending = await member(path, "PUT", { country: "FR" });
    expect(pending.status).toBe(200);
    const request = (await pending.json()).pendingRequest as { id: string };
    const requestPath = (action: string) =>
      `/workspace/${ws}/holiday-calendar-requests/${request.id}/${action}`;
    const CALENDAR =
      /Germany|Deutschland|Bavaria|Bayern|France|Frankreich|"DE"|"BY"|"FR"/;

    for (const person of [team.colleague, team.viewer]) {
      const caller = team.as(person);
      for (const response of [
        await caller(`/workspace/${ws}/holiday-calendar-requests`),
        await caller(requestPath("approve"), "POST", { version: 0 }),
        await caller(requestPath("decline"), "POST", { version: 0 }),
        await caller(requestPath("cancel"), "POST"),
        await caller(`/workspace/${ws}/settings`),
        await caller(`/workspace/${ws}/settings`, "PUT", {
          holidayCalendarDeadline: null,
        }),
        await caller(`/workspace/${ws}/holidays?userId=${team.member.id}`),
      ]) {
        expect(response.status).toBe(403);
        expect(await response.text()).not.toMatch(CALENDAR);
      }
      const own = await caller(`/workspace/${ws}/holidays?year=${next}`);
      expect(own.status).toBe(200);
      const text = await own.text();
      expect(text).not.toMatch(CALENDAR);
      expect(JSON.parse(text)).toMatchObject({
        calendar: null,
        pendingRequest: null,
      });
    }

    const [stored] = await db
      .select({ status: schema.timeOffHolidayCalendarRequestTable.status })
      .from(schema.timeOffHolidayCalendarRequestTable);
    expect(stored).toEqual({ status: "pending" });
  });

  it("answers someone else's request exactly like an unknown id", async () => {
    const team = await createTimeOffTeam();
    const seeded = await seedPrivateTimeOff(team);

    for (const person of [team.colleague, team.viewer]) {
      const caller = team.as(person);
      const unknown = await caller("/time-off-that-does-not-exist");
      expect(unknown.status).toBe(404);
      const unknownBody = await unknown.json();
      for (const id of [seeded.approvedId, seeded.pendingId]) {
        const hidden = await caller(`/${id}`);
        expect(hidden.status).toBe(404);
        expect(await hidden.json()).toEqual(unknownBody);
      }
    }

    const colleague = team.as(team.colleague);
    const unknownEdit = await colleague(
      "/time-off-that-does-not-exist",
      "PATCH",
      { note: "x" },
    );
    const hiddenEdit = await colleague(`/${seeded.pendingId}`, "PATCH", {
      note: "x",
    });
    expect(hiddenEdit.status).toBe(404);
    expect(await hiddenEdit.json()).toEqual(await unknownEdit.json());
    const unknownCancel = await colleague(
      "/time-off-that-does-not-exist/cancel",
      "POST",
    );
    const hiddenCancel = await colleague(
      `/${seeded.approvedId}/cancel`,
      "POST",
    );
    expect(hiddenCancel.status).toBe(404);
    expect(await hiddenCancel.json()).toEqual(await unknownCancel.json());
  });

  it("lists only current members once each, even with a duplicate membership row", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const range = week(2);
    const memberRow = await insertTimeOff({
      workspaceId: ws,
      userId: team.member.id,
      ...range,
      status: "approved",
    });
    await insertTimeOff({
      workspaceId: ws,
      userId: team.colleague.id,
      ...range,
      status: "approved",
    });
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: ws,
      userId: team.member.id,
      role: "member",
      joinedAt: new Date(),
    });

    const window = `from=${range.startDate}&to=${range.endDate}`;
    const admin = team.as(team.admin);
    const before = await (await admin(`/workspace/${ws}?${window}`)).json();
    expect(before.entries.map((entry: Entry) => entry.id)).toHaveLength(2);
    expect(
      before.entries.filter((entry: Entry) => entry.id === memberRow.id),
    ).toHaveLength(1);

    const instanceAdmin = await createInstanceAdmin();
    const removed = await callerFor(
      team.app,
      instanceAdmin.id,
      {},
      "/admin",
    )(`/workspaces/${ws}/members/${team.colleague.id}`, "DELETE");
    expect(removed.status).toBe(200);
    const after = await (await admin(`/workspace/${ws}?${window}`)).json();
    expect(after.entries.map((entry: Entry) => entry.userId)).toEqual([
      team.member.id,
    ]);
  });
});
