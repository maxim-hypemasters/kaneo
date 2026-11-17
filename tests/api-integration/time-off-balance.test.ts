import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createInstanceAdmin } from "./helpers/admin/create-instance-admin";
import { resetTestDatabase } from "./helpers/database";
import { resolveHolidays } from "../../apps/api/src/time-off/holidays/resolve-holidays";
import { readErrorBody } from "./helpers/error-body";
import { createWorkspaceMember } from "./helpers/fixtures";
import { addDays, insertTimeOff } from "./helpers/time-off";
import {
  currentYear,
  isWeekday,
  weekdaySpan,
  weekdaysBeforeYearEnd,
} from "./helpers/time-off-days";
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

type TimeOffType = "vacation" | "sick" | "public_holiday";

type TypeBalance = {
  allowanceDays: number;
  allowanceSource: "default" | "override";
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
};

type Balance = {
  workspaceId: string;
  userId: string;
  year: number;
  types: Record<TimeOffType, TypeBalance>;
};

const DEFAULTS = { vacation: 25, sick: 10, public_holiday: 10 };

function unused(allowanceDays: number): TypeBalance {
  return {
    allowanceDays,
    allowanceSource: "default",
    usedDays: 0,
    pendingDays: 0,
    remainingDays: allowanceDays,
  };
}

const Y = currentYear();

// 4 weekdays at the end of this year and 6 at the start of next.
function crossYearRange() {
  return {
    startDate: weekdaysBeforeYearEnd(Y, 4),
    endDate: weekdaySpan(`${Y + 1}-01-01`, 6).endDate,
  };
}

async function balanceOf(team: TimeOffTeam, userId: string, year = Y) {
  const response = await team.as(team.admin)(
    `/workspace/${team.workspaceId}/balance?userId=${userId}&year=${year}`,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Balance;
}

async function vacationOf(team: TimeOffTeam, userId: string, year = Y) {
  return (await balanceOf(team, userId, year)).types.vacation;
}

// Each year's vacation balance.
function byYear(balances: Balance[]) {
  return Object.fromEntries(
    balances.map((balance) => [balance.year, balance.types.vacation]),
  );
}

describe("time off allowances", () => {
  it("defaults to 25 vacation, 10 sick and 10 public holiday days without a policy", async () => {
    const team = await createTimeOffTeam();
    const own = await team.as(team.member)(
      `/workspace/${team.workspaceId}/balance`,
    );
    expect(own.status).toBe(200);
    expect(await own.json()).toEqual({
      workspaceId: team.workspaceId,
      userId: team.member.id,
      year: Y,
      types: {
        vacation: unused(25),
        sick: unused(10),
        public_holiday: unused(10),
      },
    });
    const all = await (
      await team.as(team.owner)(`/workspace/${team.workspaceId}/balances`)
    ).json();
    expect(all).toMatchObject({
      workspaceId: team.workspaceId,
      year: Y,
      defaultAllowances: DEFAULTS,
    });
    expect(
      all.members.map((balance: Balance) => balance.userId).sort(),
    ).toEqual(
      [
        team.owner.id,
        team.admin.id,
        team.member.id,
        team.colleague.id,
        team.viewer.id,
      ].sort(),
    );
    for (const balance of all.members) {
      expect(balance).toMatchObject({
        year: Y,
        types: {
          vacation: unused(25),
          sick: unused(10),
          public_holiday: unused(10),
        },
      });
    }
  });

  it("sets a default, overrides one member for every year and clears the override", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const admin = team.as(team.admin);

    const setDefault = await admin(
      `/workspace/${ws}/allowance/vacation`,
      "PUT",
      { days: 20 },
    );
    expect(setDefault.status).toBe(200);
    expect(await setDefault.json()).toEqual({
      workspaceId: ws,
      type: "vacation",
      defaultAllowanceDays: 20,
    });
    expect(await vacationOf(team, team.member.id)).toMatchObject({
      allowanceDays: 20,
      allowanceSource: "default",
      remainingDays: 20,
    });

    const override = await admin(
      `/workspace/${ws}/allowance/vacation/${team.member.id}`,
      "PUT",
      { days: 10 },
    );
    expect(override.status).toBe(200);
    expect(await override.json()).toMatchObject({
      workspaceId: ws,
      userId: team.member.id,
      year: Y,
      types: {
        vacation: { allowanceDays: 10, allowanceSource: "override" },
        sick: { allowanceDays: 10, allowanceSource: "default" },
      },
    });
    for (const year of [Y - 1, Y, Y + 1]) {
      expect(await balanceOf(team, team.member.id, year)).toMatchObject({
        year,
        types: { vacation: { allowanceDays: 10, allowanceSource: "override" } },
      });
    }
    expect(await vacationOf(team, team.colleague.id)).toMatchObject({
      allowanceDays: 20,
      allowanceSource: "default",
    });
    const changed = await admin(
      `/workspace/${ws}/allowance/vacation/${team.member.id}`,
      "PUT",
      { days: 12 },
    );
    expect((await changed.json()).types.vacation).toMatchObject({
      allowanceDays: 12,
    });

    const all = await (
      await admin(`/workspace/${ws}/balances?year=${Y}`)
    ).json();
    expect(all.defaultAllowances).toEqual({ ...DEFAULTS, vacation: 20 });
    expect(
      all.members.find((balance: Balance) => balance.userId === team.member.id)
        .types.vacation,
    ).toMatchObject({ allowanceDays: 12, allowanceSource: "override" });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const cleared = await admin(
        `/workspace/${ws}/allowance/vacation/${team.member.id}`,
        "DELETE",
      );
      expect(cleared.status).toBe(200);
      expect(await cleared.json()).toMatchObject({
        userId: team.member.id,
        types: { vacation: { allowanceDays: 20, allowanceSource: "default" } },
      });
    }
    expect(await vacationOf(team, team.member.id)).toMatchObject({
      allowanceDays: 20,
      allowanceSource: "default",
    });
  });

  it("keeps each type's default and override independent", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const admin = team.as(team.admin);
    const member = team.member.id;

    const sickDefault = await admin(`/workspace/${ws}/allowance/sick`, "PUT", {
      days: 5,
    });
    expect(await sickDefault.json()).toEqual({
      workspaceId: ws,
      type: "sick",
      defaultAllowanceDays: 5,
    });
    expect(
      (
        await admin(`/workspace/${ws}/allowance/vacation/${member}`, "PUT", {
          days: 30,
        })
      ).status,
    ).toBe(200);
    expect((await balanceOf(team, member)).types).toMatchObject({
      vacation: { allowanceDays: 30, allowanceSource: "override" },
      sick: { allowanceDays: 5, allowanceSource: "default" },
      public_holiday: { allowanceDays: 10, allowanceSource: "default" },
    });

    // Clearing a sick override that does not exist leaves vacation alone.
    const cleared = await admin(
      `/workspace/${ws}/allowance/sick/${member}`,
      "DELETE",
    );
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).types).toMatchObject({
      vacation: { allowanceDays: 30, allowanceSource: "override" },
      sick: { allowanceDays: 5, allowanceSource: "default" },
    });
    const all = await (await admin(`/workspace/${ws}/balances`)).json();
    expect(all.defaultAllowances).toEqual({ ...DEFAULTS, sick: 5 });
  });

  it("reads the default of each type for approvers only", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const admin = team.as(team.admin);
    async function defaults() {
      const response = await admin(`/workspace/${ws}/allowance`);
      expect(response.status).toBe(200);
      return response.json();
    }

    expect(await defaults()).toEqual({
      workspaceId: ws,
      defaultAllowances: DEFAULTS,
    });
    expect(
      (await admin(`/workspace/${ws}/allowance/sick`, "PUT", { days: 7 }))
        .status,
    ).toBe(200);
    expect(await defaults()).toEqual({
      workspaceId: ws,
      defaultAllowances: { ...DEFAULTS, sick: 7 },
    });

    const member = await team.as(team.member)(`/workspace/${ws}/allowance`);
    expect(member.status).toBe(403);
    expect(await member.text()).not.toMatch(/"sick"/);
  });

  it("rejects removed and unknown types", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const admin = team.as(team.admin);
    expect(
      (await admin(`/workspace/${ws}/allowance/personal`, "PUT", { days: 5 }))
        .status,
    ).toBe(400);
    expect(
      (
        await admin(
          `/workspace/${ws}/allowance/other/${team.member.id}`,
          "DELETE",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin(
          `/workspace/${ws}/allowance/personal/${team.member.id}`,
          "PUT",
          {
            days: 5,
          },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await team.as(team.member)(`/workspace/${ws}`, "POST", {
          type: "personal",
          ...weekdaySpan(`${Y + 1}-03-01`, 1),
        })
      ).status,
    ).toBe(400);
    await expect(
      insertTimeOff({
        workspaceId: ws,
        userId: team.member.id,
        ...weekdaySpan(`${Y}-03-01`, 1),
        type: "personal" as never,
      }),
    ).rejects.toThrow();
    expect(await db.select().from(schema.timeOffPolicyTable)).toHaveLength(0);
    expect(await db.select().from(schema.timeOffAllowanceTable)).toHaveLength(
      0,
    );
  });

  it("accepts 0 to 366 whole days and only current members", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const admin = team.as(team.admin);
    for (const days of [-1, 367, 2.5]) {
      expect(
        (await admin(`/workspace/${ws}/allowance/sick`, "PUT", { days }))
          .status,
      ).toBe(400);
      expect(
        (
          await admin(
            `/workspace/${ws}/allowance/sick/${team.member.id}`,
            "PUT",
            { days },
          )
        ).status,
      ).toBe(400);
    }
    for (const days of [0, 366]) {
      expect(
        (await admin(`/workspace/${ws}/allowance/sick`, "PUT", { days }))
          .status,
      ).toBe(200);
    }
    const outsider = await createWorkspaceMember({ role: "owner" });
    expect(
      (
        await admin(
          `/workspace/${ws}/allowance/sick/${outsider.user.id}`,
          "PUT",
          { days: 5 },
        )
      ).status,
    ).toBe(404);
    expect(await db.select().from(schema.timeOffAllowanceTable)).toHaveLength(
      0,
    );
  });
});

describe("time off balances", () => {
  it("splits a range across years: 4 days this year and 6 next", async () => {
    const team = await createTimeOffTeam();
    const range = crossYearRange();
    const created = await team.as(team.member)(
      `/workspace/${team.workspaceId}`,
      "POST",
      {
        type: "vacation",
        ...range,
      },
    );
    expect(created.status).toBe(200);
    const body = await created.json();
    expect(body.request).toMatchObject({
      days: 10,
      daysByYear: [
        { year: Y, days: 4 },
        { year: Y + 1, days: 6 },
      ],
    });
    const pending = byYear(body.balances);
    expect(Object.keys(pending).map(Number).sort()).toEqual([Y, Y + 1]);
    expect(pending[Y]).toMatchObject({
      pendingDays: 4,
      usedDays: 0,
      remainingDays: 25,
    });
    expect(pending[Y + 1]).toMatchObject({
      pendingDays: 6,
      usedDays: 0,
      remainingDays: 25,
    });

    const approved = await team.as(team.admin)(
      `/${body.request.id}/approve`,
      "POST",
      {
        version: 0,
      },
    );
    const used = byYear((await approved.json()).balances);
    expect(used[Y]).toMatchObject({
      usedDays: 4,
      pendingDays: 0,
      remainingDays: 21,
    });
    expect(used[Y + 1]).toMatchObject({
      usedDays: 6,
      pendingDays: 0,
      remainingDays: 19,
    });

    expect(await vacationOf(team, team.member.id, Y)).toMatchObject({
      usedDays: 4,
      remainingDays: 21,
    });
    expect(await vacationOf(team, team.member.id, Y + 1)).toMatchObject({
      usedDays: 6,
      remainingDays: 19,
    });
    const nextYear = await (
      await team.as(team.owner)(
        `/workspace/${team.workspaceId}/balances?year=${Y + 1}`,
      )
    ).json();
    expect(
      nextYear.members.find(
        (balance: Balance) => balance.userId === team.member.id,
      ),
    ).toMatchObject({ year: Y + 1, types: { vacation: { usedDays: 6 } } });
  });

  it("allows going over the allowance and shows it", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const admin = team.as(team.admin);
    await admin(
      `/workspace/${ws}/allowance/vacation/${team.member.id}`,
      "PUT",
      {
        days: 3,
      },
    );

    const created = await team.as(team.member)(`/workspace/${ws}`, "POST", {
      type: "vacation",
      ...weekdaySpan(`${Y}-03-02`, 5),
    });
    expect(created.status).toBe(200);
    const { request, balances } = await created.json();
    // Pending days are reported, not subtracted.
    expect(byYear(balances)[Y]).toMatchObject({
      allowanceDays: 3,
      pendingDays: 5,
      usedDays: 0,
      remainingDays: 3,
    });
    const queue = await (await admin(`/workspace/${ws}/pending`)).json();
    expect(queue.requests[0]).toMatchObject({
      id: request.id,
      overAllowanceDays: [{ year: Y, days: 2 }],
    });

    const approved = await admin(`/${request.id}/approve`, "POST", {
      version: 0,
    });
    expect(approved.status).toBe(200);
    expect(byYear((await approved.json()).balances)[Y]).toMatchObject({
      usedDays: 5,
      pendingDays: 0,
      remainingDays: -2,
    });
  });

  it("does not carry unused or overdrawn days into the next year", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    await insertTimeOff({
      workspaceId: ws,
      userId: team.member.id,
      ...weekdaySpan(`${Y - 1}-03-01`, 10),
      status: "approved",
    });
    await insertTimeOff({
      workspaceId: ws,
      userId: team.member.id,
      ...weekdaySpan(`${Y}-02-01`, 30),
      status: "approved",
    });

    expect(await vacationOf(team, team.member.id, Y - 1)).toMatchObject({
      allowanceDays: 25,
      usedDays: 10,
      remainingDays: 15,
    });
    expect(await vacationOf(team, team.member.id, Y)).toMatchObject({
      allowanceDays: 25,
      usedDays: 30,
      remainingDays: -5,
    });
    expect(await vacationOf(team, team.member.id, Y + 1)).toMatchObject({
      allowanceDays: 25,
      usedDays: 0,
      pendingDays: 0,
      remainingDays: 25,
    });
  });

  it("ignores declined and cancelled time off", async () => {
    const team = await createTimeOffTeam();
    for (const [status, from] of [
      ["declined", `${Y}-03-01`],
      ["cancelled", `${Y}-05-01`],
    ] as const) {
      await insertTimeOff({
        workspaceId: team.workspaceId,
        userId: team.member.id,
        ...weekdaySpan(from, 5),
        status,
      });
    }
    expect(await vacationOf(team, team.member.id)).toMatchObject({
      usedDays: 0,
      pendingDays: 0,
      remainingDays: 25,
    });
  });

  it("computes overAllowanceDays per year for each pending request on its own", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    await team.as(team.owner)(`/workspace/${ws}/allowance/vacation`, "PUT", {
      days: 10,
    });
    const userId = team.member.id;
    await insertTimeOff({
      workspaceId: ws,
      userId,
      ...weekdaySpan(`${Y}-02-01`, 8),
      status: "approved",
    });
    const five = await insertTimeOff({
      workspaceId: ws,
      userId,
      ...weekdaySpan(`${Y}-04-01`, 5),
    });
    const one = await insertTimeOff({
      workspaceId: ws,
      userId,
      ...weekdaySpan(`${Y}-05-01`, 1),
    });
    const crossing = await insertTimeOff({
      workspaceId: ws,
      userId,
      ...crossYearRange(),
    });

    const response = await team.as(team.admin)(`/workspace/${ws}/pending`);
    expect(response.status).toBe(200);
    const { requests } = await response.json();
    expect(requests.map((request: { id: string }) => request.id)).toEqual([
      five.id,
      one.id,
      crossing.id,
    ]);
    const [first, second, third] = requests;
    expect(first.overAllowanceDays).toEqual([{ year: Y, days: 3 }]);
    expect(second.overAllowanceDays).toEqual([{ year: Y, days: 0 }]);
    expect(third.overAllowanceDays).toEqual([
      { year: Y, days: 2 },
      { year: Y + 1, days: 0 },
    ]);
    expect(byYear(first.balances)[Y]).toMatchObject({
      allowanceDays: 10,
      usedDays: 8,
      pendingDays: 10,
      remainingDays: 2,
    });
    expect(Object.keys(byYear(third.balances)).map(Number).sort()).toEqual([
      Y,
      Y + 1,
    ]);
    expect(byYear(third.balances)[Y + 1]).toMatchObject({
      usedDays: 0,
      pendingDays: 6,
    });
  });

  it("returns balances for the old and the new years after an edit", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    const created = await (
      await member(`/workspace/${team.workspaceId}`, "POST", {
        type: "vacation",
        ...weekdaySpan(`${Y}-06-01`, 3),
      })
    ).json();
    const moved = await member(
      `/${created.request.id}`,
      "PATCH",
      weekdaySpan(`${Y + 1}-06-01`, 3),
    );
    expect(moved.status).toBe(200);
    const { balances } = (await moved.json()) as { balances: Balance[] };
    expect(balances.map((balance) => balance.year)).toEqual([Y, Y + 1]);
    expect(balances[0]).toMatchObject({
      userId: team.member.id,
      types: { vacation: { pendingDays: 0 } },
    });
    expect(balances[1]).toMatchObject({
      userId: team.member.id,
      types: { vacation: { pendingDays: 3 } },
    });

    const cancelled = await member(`/${created.request.id}/cancel`, "POST");
    expect(byYear((await cancelled.json()).balances)[Y + 1]).toMatchObject({
      pendingDays: 0,
    });
  });

  it("counts each type only against its own allowance", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const userId = team.member.id;
    await insertTimeOff({
      workspaceId: ws,
      userId,
      ...weekdaySpan(`${Y}-03-02`, 2),
      type: "sick",
      status: "approved",
    });
    await insertTimeOff({
      workspaceId: ws,
      userId,
      ...weekdaySpan(`${Y}-04-01`, 5),
      type: "vacation",
      status: "approved",
    });
    await insertTimeOff({
      workspaceId: ws,
      userId,
      ...weekdaySpan(`${Y}-05-04`, 1),
      type: "public_holiday",
    });
    expect((await balanceOf(team, userId)).types).toEqual({
      vacation: { ...unused(25), usedDays: 5, remainingDays: 20 },
      sick: { ...unused(10), usedDays: 2, remainingDays: 8 },
      public_holiday: { ...unused(10), pendingDays: 1 },
    });
  });

  it("measures overAllowanceDays against the request's own type", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const userId = team.member.id;
    await insertTimeOff({
      workspaceId: ws,
      userId,
      ...weekdaySpan(`${Y}-02-01`, 25),
      status: "approved",
    });
    const sick = await insertTimeOff({
      workspaceId: ws,
      userId,
      ...weekdaySpan(`${Y}-06-01`, 3),
      type: "sick",
    });
    const vacation = await insertTimeOff({
      workspaceId: ws,
      userId,
      ...weekdaySpan(`${Y}-07-01`, 1),
    });
    const { requests } = await (
      await team.as(team.admin)(`/workspace/${ws}/pending`)
    ).json();
    const byId = new Map(
      requests.map((request: { id: string }) => [request.id, request]),
    );
    expect(byId.get(sick.id)).toMatchObject({
      overAllowanceDays: [{ year: Y, days: 0 }],
    });
    expect(byId.get(vacation.id)).toMatchObject({
      overAllowanceDays: [{ year: Y, days: 1 }],
    });
  });

  it("moves pending days to the new type when an edit changes it", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    const range = weekdaySpan(`${Y + 1}-03-01`, 4);
    const created = await (
      await member(`/workspace/${team.workspaceId}`, "POST", {
        type: "vacation",
        ...range,
      })
    ).json();
    expect(created.balances[0].types).toMatchObject({
      vacation: { pendingDays: 4 },
      sick: { pendingDays: 0 },
    });
    const edited = await member(`/${created.request.id}`, "PATCH", {
      type: "sick",
    });
    expect(edited.status).toBe(200);
    const [balance] = (await edited.json()).balances;
    expect(balance).toMatchObject({
      year: Y + 1,
      types: { vacation: { pendingDays: 0 }, sick: { pendingDays: 4 } },
    });
  });

  it("counts calendar holidays as used public holidays and leaves them out of other days", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const userId = team.member.id;
    await db.insert(schema.timeOffHolidayCalendarTable).values({
      workspaceId: ws,
      userId,
      country: "DE",
      region: null,
    });
    const holidays = resolveHolidays({ country: "DE", region: null }, Y).map(
      (holiday) => holiday.date,
    );
    const weekdayHolidays = holidays.filter(isWeekday);
    expect(weekdayHolidays.length).toBeGreaterThan(0);

    // The Monday-to-Friday week of the first weekday holiday that lies
    // wholly inside the year.
    const week = weekdayHolidays
      .map((day) => {
        const monday = addDays(
          day,
          -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7),
        );
        return { startDate: monday, endDate: addDays(monday, 4) };
      })
      .find(
        ({ startDate, endDate }) =>
          startDate >= `${Y}-01-01` && endDate <= `${Y}-12-31`,
      );
    if (!week) throw new Error("No holiday week inside the year");
    const holidaysInWeek = weekdayHolidays.filter(
      (day) => day >= week.startDate && day <= week.endDate,
    ).length;
    const vacation = await insertTimeOff({
      workspaceId: ws,
      userId,
      ...week,
      status: "approved",
    });

    expect((await balanceOf(team, userId)).types).toMatchObject({
      vacation: { usedDays: 5 - holidaysInWeek },
      public_holiday: {
        usedDays: weekdayHolidays.length,
        remainingDays: 10 - weekdayHolidays.length,
      },
    });
    expect(
      await (await team.as(team.member)(`/${vacation.id}`)).json(),
    ).toMatchObject({
      days: 5 - holidaysInWeek,
      daysByYear: [{ year: Y, days: 5 - holidaysInWeek }],
    });
    expect((await balanceOf(team, team.colleague.id)).types).toMatchObject({
      public_holiday: { usedDays: 0 },
    });
  });

  it("needs a working day that is not a calendar holiday", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    await db.insert(schema.timeOffHolidayCalendarTable).values({
      workspaceId: ws,
      userId: team.member.id,
      country: "DE",
      region: null,
    });
    const holiday = resolveHolidays({ country: "DE", region: null }, Y + 1)
      .map((entry) => entry.date)
      .find(isWeekday);
    if (!holiday) throw new Error("No weekday holiday next year");
    const onHoliday = {
      type: "vacation",
      startDate: holiday,
      endDate: holiday,
    };

    const refused = await team.as(team.member)(
      `/workspace/${ws}`,
      "POST",
      onHoliday,
    );
    expect(refused.status).toBe(400);
    expect(await readErrorBody(refused)).toMatchObject({
      code: "TIME_OFF_NO_WEEKDAYS",
      message: "Time off must include at least one working day",
    });
    // A colleague without a calendar works that day.
    expect(
      (await team.as(team.colleague)(`/workspace/${ws}`, "POST", onHoliday))
        .status,
    ).toBe(200);
    // Moving an existing request onto the holiday is refused the same way.
    const other = await (
      await team.as(team.member)(`/workspace/${ws}`, "POST", {
        type: "vacation",
        ...weekdaySpan(`${Y + 1}-09-01`, 1),
      })
    ).json();
    const moved = await team.as(team.member)(`/${other.request.id}`, "PATCH", {
      startDate: holiday,
      endDate: holiday,
    });
    expect(moved.status).toBe(400);
    expect((await readErrorBody(moved)).code).toBe("TIME_OFF_NO_WEEKDAYS");
  });

  it("counts a member once even with a duplicate membership row", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    await insertTimeOff({
      workspaceId: ws,
      userId: team.member.id,
      ...weekdaySpan(`${Y}-03-02`, 5),
      status: "approved",
    });
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: ws,
      userId: team.member.id,
      role: "member",
      joinedAt: new Date(),
    });
    expect(await vacationOf(team, team.member.id)).toMatchObject({
      usedDays: 5,
    });
    const all = await (
      await team.as(team.admin)(`/workspace/${ws}/balances`)
    ).json();
    const mine = all.members.filter(
      (balance: Balance) => balance.userId === team.member.id,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].types.vacation).toMatchObject({ usedDays: 5 });
    expect(all.members).toHaveLength(5);

    const pending = await insertTimeOff({
      workspaceId: ws,
      userId: team.member.id,
      ...weekdaySpan(`${Y}-05-04`, 2),
    });
    const queue = await (
      await team.as(team.admin)(`/workspace/${ws}/pending`)
    ).json();
    expect(queue.requests.map((request: { id: string }) => request.id)).toEqual(
      [pending.id],
    );
    expect(queue.requests[0].overAllowanceDays).toEqual([{ year: Y, days: 0 }]);
    const own = await (
      await team.as(team.member)(`/workspace/${ws}/requests?year=${Y}`)
    ).json();
    expect(own.requests).toHaveLength(2);
  });
});

describe("removing a member", () => {
  it("cancels their pending time off and clears their notes in that workspace only", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const userId = team.member.id;
    const pending = await insertTimeOff({
      workspaceId: ws,
      userId,
      ...weekdaySpan(`${Y + 1}-02-01`, 3),
      note: "private",
    });
    const approved = await insertTimeOff({
      workspaceId: ws,
      userId,
      ...weekdaySpan(`${Y + 1}-03-01`, 3),
      status: "approved",
      note: "trip",
    });
    const declined = await insertTimeOff({
      workspaceId: ws,
      userId,
      ...weekdaySpan(`${Y + 1}-04-01`, 3),
      status: "declined",
      note: "nope",
    });
    const other = await createWorkspaceMember({ role: "owner" });
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: other.workspace.id,
      userId,
      role: "member",
      joinedAt: new Date(),
    });
    const elsewhere = await insertTimeOff({
      workspaceId: other.workspace.id,
      userId,
      ...weekdaySpan(`${Y + 1}-02-01`, 3),
      note: "elsewhere",
    });
    const colleagueRow = await insertTimeOff({
      workspaceId: ws,
      userId: team.colleague.id,
      ...weekdaySpan(`${Y + 1}-02-01`, 3),
      note: "stays",
    });

    const instanceAdmin = await createInstanceAdmin();
    const removed = await callerFor(
      team.app,
      instanceAdmin.id,
      {},
      "/admin",
    )(`/workspaces/${ws}/members/${userId}`, "DELETE");
    expect(removed.status).toBe(200);

    const rows = new Map(
      (await db.select().from(schema.timeOffTable)).map((row) => [row.id, row]),
    );
    expect(rows.get(pending.id)).toMatchObject({
      status: "cancelled",
      note: null,
    });
    expect(rows.get(approved.id)).toMatchObject({
      status: "approved",
      note: null,
    });
    expect(rows.get(declined.id)).toMatchObject({
      status: "declined",
      note: null,
    });
    expect(rows.get(elsewhere.id)).toMatchObject({
      status: "pending",
      note: "elsewhere",
    });
    expect(rows.get(colleagueRow.id)).toMatchObject({
      status: "pending",
      note: "stays",
    });

    const admin = team.as(team.admin);
    const queue = await (await admin(`/workspace/${ws}/pending`)).json();
    expect(queue.requests.map((request: { id: string }) => request.id)).toEqual(
      [colleagueRow.id],
    );
    const all = await (
      await admin(`/workspace/${ws}/balances?year=${Y + 1}`)
    ).json();
    expect(all.members.map((balance: Balance) => balance.userId)).not.toContain(
      userId,
    );
    expect(all.members).toHaveLength(4);

    const [membership] = await db
      .select()
      .from(schema.workspaceUserTable)
      .where(eq(schema.workspaceUserTable.userId, userId));
    expect(membership?.workspaceId).toBe(other.workspace.id);

    // Transitions lock the row only while its person is still a member.
    expect(
      (await admin(`/${approved.id}`, "PATCH", { note: "x" })).status,
    ).toBe(404);
    expect((await admin(`/${approved.id}/cancel`, "POST")).status).toBe(404);
    expect(rows.get(approved.id)?.status).toBe("approved");
    const [after] = await db
      .select()
      .from(schema.timeOffTable)
      .where(eq(schema.timeOffTable.id, approved.id));
    expect(after).toMatchObject({ status: "approved", note: null, version: 0 });
  });
});
