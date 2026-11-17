import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createInstanceAdmin } from "./helpers/admin/create-instance-admin";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import { createWorkspaceMember } from "./helpers/fixtures";
import { addDays } from "./helpers/time-off";
import {
  currentYear,
  isWeekday,
  weekdaysBetween,
} from "./helpers/time-off-days";
import {
  type Caller,
  callerFor,
  createTimeOffTeam,
  type TimeOffTeam,
} from "./helpers/time-off-team";

vi.mock("../../apps/api/src/events", async (original) => {
  const { awaitEventHandlers } = await import("./helpers/await-event-handlers");
  return awaitEventHandlers(original);
});

beforeEach(resetTestDatabase);

// Next year stays inside the request window whenever the tests run.
const NEXT = currentYear() + 1;

type Holiday = { date: string; name: string };
type CalendarHoliday = { userId: string; date: string; name?: string };

const calendarPath = (team: TimeOffTeam, query = "") =>
  `/workspace/${team.workspaceId}/holiday-calendar${query}`;

async function setCalendar(
  caller: Caller,
  team: TimeOffTeam,
  body: Record<string, unknown>,
) {
  const response = await caller(calendarPath(team), "PUT", body);
  expect(response.status).toBe(200);
  return response.json();
}

// The member's calendar holidays next year, read through the API rather than
// hard-coded, so the tests follow the shipped holiday data.
async function holidaysOf(caller: Caller, team: TimeOffTeam, userId?: string) {
  const query = `year=${NEXT}${userId ? `&userId=${userId}` : ""}`;
  const response = await caller(
    `/workspace/${team.workspaceId}/holidays?${query}`,
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { holidays: Holiday[] }).holidays;
}

async function calendarWindow(
  caller: Caller,
  team: TimeOffTeam,
  from: string,
  to: string,
) {
  const response = await caller(
    `/workspace/${team.workspaceId}?from=${from}&to=${to}`,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    entries: Array<{ id: string; userId: string; days?: number }>;
    holidays: CalendarHoliday[];
  };
}

// A Bavarian member, and their weekday holidays next year.
async function bavarianMember(team: TimeOffTeam) {
  const member = team.as(team.member);
  await setCalendar(member, team, { country: "DE", region: "BY" });
  const weekdays = (await holidaysOf(member, team))
    .map((holiday) => holiday.date)
    .filter(isWeekday);
  expect(weekdays.length).toBeGreaterThan(0);
  return { member, weekdays };
}

describe("holiday calendar catalog", () => {
  it("lists countries and regions in the requested language to any time off role", async () => {
    const team = await createTimeOffTeam();
    const viewer = team.as(team.viewer);
    const ws = team.workspaceId;

    const english = await viewer(`/workspace/${ws}/holiday-countries`);
    expect(english.status).toBe(200);
    const countries = await english.json();
    expect(countries.workspaceId).toBe(ws);
    expect(countries.countries).toContainEqual({ code: "DE", name: "Germany" });
    const german = await (
      await viewer(`/workspace/${ws}/holiday-countries?lang=de-DE`)
    ).json();
    expect(german.countries).toContainEqual({
      code: "DE",
      name: "Deutschland",
    });

    const regions = await viewer(
      `/workspace/${ws}/holiday-countries/de/regions?lang=de`,
    );
    expect(regions.status).toBe(200);
    const body = await regions.json();
    expect(body).toMatchObject({ workspaceId: ws, country: "DE" });
    expect(body.regions).toContainEqual({ code: "BY", name: "Bayern" });

    expect(
      (await viewer(`/workspace/${ws}/holiday-countries/ZZ/regions`)).status,
    ).toBe(404);
    expect(
      (await viewer(`/workspace/${ws}/holiday-countries?lang=not a language`))
        .status,
    ).toBe(400);
  });

  it("is closed to people outside the workspace", async () => {
    const team = await createTimeOffTeam();
    const outsider = await createWorkspaceMember();
    const response = await callerFor(
      team.app,
      outsider.user.id,
    )(`/workspace/${team.workspaceId}/holiday-countries`);
    expect([403, 404]).toContain(response.status);
  });
});

describe("setting a holiday calendar", () => {
  it("sets and reads your own calendar, normalizing codes, and asks before changing it", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);

    const set = await setCalendar(member, team, {
      country: " de ",
      region: "by",
    });
    expect(set).toMatchObject({
      workspaceId: team.workspaceId,
      userId: team.member.id,
      calendar: { country: "DE", countryName: "Germany", region: "BY" },
    });
    expect(typeof set.calendar.regionName).toBe("string");

    const read = await member(
      `/workspace/${team.workspaceId}/holidays?year=${NEXT}&lang=de`,
    );
    expect(read.status).toBe(200);
    const body = await read.json();
    expect(body).toMatchObject({
      workspaceId: team.workspaceId,
      userId: team.member.id,
      year: NEXT,
      calendar: {
        country: "DE",
        countryName: "Deutschland",
        region: "BY",
        regionName: "Bayern",
      },
    });
    expect(body.holidays).toContainEqual({
      date: `${NEXT}-01-01`,
      name: "Neujahr",
    });
    // Bavaria adds Epiphany; Dec 24 is a bank holiday, not a public one.
    const dates = body.holidays.map((holiday: Holiday) => holiday.date);
    expect(dates).toContain(`${NEXT}-01-06`);
    expect(dates).not.toContain(`${NEXT}-12-24`);
    expect(dates).toEqual([...dates].sort());

    expect(body).toMatchObject({
      calendarChosen: true,
      pendingRequest: null,
      holidayCalendarDeadline: null,
      nextChangeNeedsApproval: true,
    });

    // Setting the same calendar again is a no-op that still answers.
    expect(
      await setCalendar(member, team, { country: "DE", region: "BY" }),
    ).toMatchObject({ status: "applied", pendingRequest: null });
    // After the free first choice, dropping the region waits for approval.
    const country = await setCalendar(member, team, {
      country: "DE",
      region: null,
    });
    expect(country).toMatchObject({
      status: "pending",
      calendar: { country: "DE", region: "BY" },
      pendingRequest: { calendar: { country: "DE", region: null } },
    });
    expect(
      (await holidaysOf(member, team)).map((holiday) => holiday.date),
    ).toContain(`${NEXT}-01-06`);

    // Clearing replaces the pending change; asking again changes nothing.
    for (const version of [1, 1]) {
      const cleared = await member(calendarPath(team), "DELETE");
      expect(cleared.status).toBe(200);
      expect(await cleared.json()).toEqual({
        workspaceId: team.workspaceId,
        userId: team.member.id,
        status: "pending",
        calendar: {
          country: "DE",
          countryName: "Germany",
          region: "BY",
          regionName: set.calendar.regionName,
        },
        pendingRequest: {
          id: country.pendingRequest.id,
          workspaceId: team.workspaceId,
          userId: team.member.id,
          status: "pending",
          version,
          calendar: null,
          createdAt: country.pendingRequest.createdAt,
          updatedAt: expect.any(String),
        },
      });
    }
    const current = await (
      await member(`/workspace/${team.workspaceId}/holidays`)
    ).json();
    expect(current).toMatchObject({
      calendar: { country: "DE", region: "BY" },
      pendingRequest: { calendar: null },
    });
    expect(current.year).toBe(currentYear());
  });

  it("refuses unknown countries and regions", async () => {
    const team = await createTimeOffTeam();
    const member = team.as(team.member);
    for (const body of [
      { country: "ZZ" },
      { country: "DE", region: "XX" },
      { country: "AT", region: "BY" },
    ]) {
      const response = await member(calendarPath(team), "PUT", body);
      expect(response.status).toBe(400);
      expect(await readErrorBody(response)).toMatchObject({
        code: "TIME_OFF_HOLIDAY_CALENDAR_UNKNOWN",
      });
    }
    for (const body of [
      { country: "D E" },
      { country: "DE", note: "x" },
      { region: "BY" },
    ]) {
      expect((await member(calendarPath(team), "PUT", body)).status).toBe(400);
    }
    expect(await db.select().from(schema.timeOffHolidayCalendarTable)).toEqual(
      [],
    );
  });

  it("lets you manage your own calendar and approvers manage anyone's", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const member = team.as(team.member);
    const admin = team.as(team.admin);
    const de = { country: "DE" };

    // A member acting for a colleague needs approve.
    for (const [method, path, body] of [
      ["PUT", calendarPath(team), { ...de, userId: team.colleague.id }],
      ["DELETE", calendarPath(team, `?userId=${team.colleague.id}`), undefined],
    ] as const) {
      const response = await member(path, method, body);
      expect(response.status).toBe(403);
      expect(await readErrorBody(response)).toMatchObject({
        code: "MISSING_PERMISSION",
        missingPermissions: ["time_off:approve"],
      });
    }
    const peek = await member(
      `/workspace/${ws}/holidays?userId=${team.colleague.id}`,
    );
    expect(peek.status).toBe(403);

    // A viewer may read the catalog but not pick a calendar.
    expect(
      (await team.as(team.viewer)(calendarPath(team), "PUT", de)).status,
    ).toBe(403);

    // Approvers set, read and clear a member's calendar.
    const set = await setCalendar(admin, team, {
      ...de,
      userId: team.member.id,
    });
    expect(set).toMatchObject({ userId: team.member.id, calendar: de });
    const own = await (await member(`/workspace/${ws}/holidays`)).json();
    expect(own.calendar).toMatchObject(de);
    const theirs = await admin(
      `/workspace/${ws}/holidays?userId=${team.member.id}`,
    );
    expect(theirs.status).toBe(200);
    expect((await theirs.json()).calendar).toMatchObject(de);
    expect(
      (await admin(calendarPath(team, `?userId=${team.member.id}`), "DELETE"))
        .status,
    ).toBe(200);
    expect(
      await (await member(`/workspace/${ws}/holidays`)).json(),
    ).toMatchObject({ calendar: null, calendarChosen: true, holidays: [] });

    // Someone outside the workspace is not a member to act for.
    const outsider = await createWorkspaceMember();
    for (const response of [
      await admin(calendarPath(team), "PUT", {
        ...de,
        userId: outsider.user.id,
      }),
      await admin(calendarPath(team, `?userId=${outsider.user.id}`), "DELETE"),
      await admin(`/workspace/${ws}/holidays?userId=${outsider.user.id}`),
    ]) {
      expect(response.status).toBe(404);
    }
  });
});

describe("counting with a holiday calendar", () => {
  it("leaves calendar holidays out of requests and refuses a holiday-only one", async () => {
    const team = await createTimeOffTeam();
    const { member, weekdays } = await bavarianMember(team);
    const ws = team.workspaceId;

    // The Monday-to-Friday week of the first weekday holiday that lies inside
    // next year.
    const holiday = weekdays.find((day) => {
      const sinceMonday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
      const monday = addDays(day, -sinceMonday);
      return monday >= `${NEXT}-01-01` && addDays(monday, 4) <= `${NEXT}-12-31`;
    });
    if (!holiday) throw new Error("No holiday week inside next year");
    const monday = addDays(
      holiday,
      -((new Date(`${holiday}T00:00:00Z`).getUTCDay() + 6) % 7),
    );
    const week = { startDate: monday, endDate: addDays(monday, 4) };
    const inWeek = weekdays.filter(
      (day) => day >= week.startDate && day <= week.endDate,
    ).length;
    const created = await member(`/workspace/${ws}`, "POST", {
      type: "vacation",
      ...week,
    });
    expect(created.status).toBe(200);
    expect((await created.json()).request).toMatchObject({
      days: 5 - inWeek,
      daysByYear: [{ year: NEXT, days: 5 - inWeek }],
    });

    const onlyHoliday = await member(`/workspace/${ws}`, "POST", {
      type: "vacation",
      startDate: weekdays.at(-1),
      endDate: weekdays.at(-1),
    });
    expect(onlyHoliday.status).toBe(400);
    expect(await readErrorBody(onlyHoliday)).toMatchObject({
      code: "TIME_OFF_NO_WEEKDAYS",
    });
  });

  it("still takes public_holiday requests for days the calendar leaves out", async () => {
    const team = await createTimeOffTeam();
    const { member, weekdays } = await bavarianMember(team);
    const ws = team.workspaceId;

    // Dec 24 is a bank holiday, not a public one; use the last weekday on or
    // before it that is not a calendar holiday.
    let day = `${NEXT}-12-24`;
    while (!isWeekday(day) || weekdays.includes(day)) day = addDays(day, -1);
    const response = await member(`/workspace/${ws}`, "POST", {
      type: "public_holiday",
      startDate: day,
      endDate: day,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.request).toMatchObject({ type: "public_holiday", days: 1 });
    const balance = body.balances.find(
      (item: { year: number }) => item.year === NEXT,
    );
    expect(balance.types.public_holiday).toMatchObject({
      usedDays: weekdays.length,
      pendingDays: 1,
    });
  });
});

describe("holidays on the team calendar", () => {
  it("drops a leaver's holidays and brings them back when they rejoin", async () => {
    const team = await createTimeOffTeam();
    await bavarianMember(team);
    const admin = team.as(team.admin);
    const from = `${NEXT}-01-01`;
    const to = `${NEXT}-01-31`;
    const memberDays = async () =>
      (await calendarWindow(admin, team, from, to)).holidays
        .filter((holiday) => holiday.userId === team.member.id)
        .map((holiday) => holiday.date);

    expect(await memberDays()).toEqual(
      expect.arrayContaining([`${NEXT}-01-01`, `${NEXT}-01-06`]),
    );

    const instanceAdmin = await createInstanceAdmin();
    const removed = await callerFor(
      team.app,
      instanceAdmin.id,
      {},
      "/admin",
    )(`/workspaces/${team.workspaceId}/members/${team.member.id}`, "DELETE");
    expect(removed.status).toBe(200);
    expect(await memberDays()).toEqual([]);
    expect(
      (
        await admin(
          `/workspace/${team.workspaceId}/holidays?userId=${team.member.id}`,
        )
      ).status,
    ).toBe(404);

    await db.insert(schema.workspaceUserTable).values({
      workspaceId: team.workspaceId,
      userId: team.member.id,
      role: "member",
      joinedAt: new Date(),
    });
    expect(await memberDays()).toContain(`${NEXT}-01-06`);
  });

  it("counts an entry crossing the window edge the same in both windows", async () => {
    const team = await createTimeOffTeam();
    const { member, weekdays } = await bavarianMember(team);
    const ws = team.workspaceId;

    // From three days before the holiday's month to the holiday itself, so
    // the holiday is inside one month's window and outside the other.
    const holiday = weekdays.find((day) => day > `${NEXT}-01-31`);
    if (!holiday) throw new Error("No weekday holiday after January");
    const monthStart = `${holiday.slice(0, 8)}01`;
    const range = { startDate: addDays(monthStart, -3), endDate: holiday };
    const created = await member(`/workspace/${ws}`, "POST", {
      type: "vacation",
      ...range,
    });
    expect(created.status).toBe(200);
    const request = (await created.json()).request as {
      id: string;
      days: number;
    };
    const expected =
      weekdaysBetween(range.startDate, range.endDate) -
      weekdays.filter((day) => day >= range.startDate && day <= range.endDate)
        .length;
    expect(request.days).toBe(expected);
    expect((await (await member(`/${request.id}`)).json()).days).toBe(expected);

    const before = await calendarWindow(
      member,
      team,
      addDays(monthStart, -10),
      addDays(monthStart, -1),
    );
    const during = await calendarWindow(
      member,
      team,
      monthStart,
      addDays(monthStart, 27),
    );
    for (const window of [before, during]) {
      expect(
        window.entries.find((entry) => entry.id === request.id)?.days,
      ).toBe(expected);
    }
    const dates = (window: typeof before) =>
      window.holidays.map((item) => item.date);
    expect(dates(before)).not.toContain(holiday);
    expect(dates(during)).toContain(holiday);
  });
});
