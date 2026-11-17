import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertTask } from "./helpers/release/insert-task";
import { addDays, mondayInWeeks } from "./helpers/time-off";
import { todayUtc } from "./helpers/time-off-days";
import {
  type Caller,
  createTimeOffTeam,
  type TimeOffTeam,
} from "./helpers/time-off-team";

const publish = vi.hoisted(() =>
  vi.fn(async (_event: string, _data?: unknown) => undefined),
);
vi.mock("../../apps/api/src/events", async (original) => ({
  ...(await original<typeof import("../../apps/api/src/events")>()),
  publishEvent: publish,
}));

beforeEach(async () => {
  await resetTestDatabase();
  publish.mockClear();
});

type Request = { id: string; version: number };

const scheduleEvents = () =>
  publish.mock.calls
    .filter(([event]) => event === "project-schedule.changed")
    .map(([, data]) => data as { workspaceId: string; projectIds: string[] });

function futureWeek() {
  const startDate = mondayInWeeks(2);
  return { startDate, endDate: addDays(startDate, 4) };
}

async function create(
  caller: Caller,
  workspaceId: string,
  range: { startDate: string; endDate: string },
) {
  const response = await caller(`/workspace/${workspaceId}`, "POST", {
    type: "vacation",
    ...range,
  });
  expect(response.status).toBe(200);
  return (await response.json()).request as Request;
}

async function act(caller: Caller, path: string, body: unknown = {}) {
  const response = await caller(path, "POST", body);
  expect(response.status).toBe(200);
  return (await response.json()).request as Request;
}

const approve = (team: TimeOffTeam, request: Request) =>
  act(team.as(team.owner), `/${request.id}/approve`, {
    version: request.version,
  });

// The member is assigned a task in one project and a bug in another. Their
// colleague's project and another workspace's project must not refresh.
async function plannedTeam() {
  const team = await createTimeOffTeam();
  const projects = await Promise.all(
    ["Task work", "Bug work", "Colleague work"].map(async (name) => {
      const { project } = await createProjectFixture({
        workspaceId: team.workspaceId,
        name,
      });
      return project.id;
    }),
  );
  const [taskProject, bugProject, colleagueProject] = projects as [
    string,
    string,
    string,
  ];
  await insertTask(taskProject, { userId: team.member.id });
  await insertTask(bugProject, { userId: team.member.id, type: "bug" });
  await insertTask(colleagueProject, { userId: team.colleague.id });
  const elsewhere = await createWorkspaceMember({ role: "owner" });
  const { project: foreign } = await createProjectFixture({
    workspaceId: elsewhere.workspace.id,
  });
  await insertTask(foreign.id, { userId: team.member.id });
  const refresh = {
    workspaceId: team.workspaceId,
    projectIds: [taskProject, bugProject].sort(),
  };
  return { team, refresh };
}

const sorted = (events: ReturnType<typeof scheduleEvents>) =>
  events.map((event) => ({
    ...event,
    projectIds: [...event.projectIds].sort(),
  }));

describe("time off schedule refresh events", () => {
  it("refreshes the requester's projects once when time off is approved", async () => {
    const { team, refresh } = await plannedTeam();
    const request = await create(
      team.as(team.member),
      team.workspaceId,
      futureWeek(),
    );
    expect(scheduleEvents()).toEqual([]);
    await approve(team, request);
    expect(sorted(scheduleEvents())).toEqual([refresh]);
  });

  it("refreshes once when approved time off is cancelled or its dates change", async () => {
    const { team, refresh } = await plannedTeam();
    const week = futureWeek();
    const approved = await approve(
      team,
      await create(team.as(team.member), team.workspaceId, week),
    );
    publish.mockClear();
    const owner = team.as(team.owner);
    expect(
      (await owner(`/${approved.id}`, "PATCH", { note: "Booked" })).status,
    ).toBe(200);
    expect(scheduleEvents()).toEqual([]);
    expect(
      (
        await owner(`/${approved.id}`, "PATCH", {
          endDate: addDays(week.startDate, 2),
        })
      ).status,
    ).toBe(200);
    expect(sorted(scheduleEvents())).toEqual([refresh]);
    publish.mockClear();
    await act(team.as(team.member), `/${approved.id}/cancel`);
    expect(sorted(scheduleEvents())).toEqual([refresh]);
  });

  it("publishes no refresh for pending changes and declines", async () => {
    const { team } = await plannedTeam();
    const member = team.as(team.member);
    const week = futureWeek();
    const edited = await create(member, team.workspaceId, week);
    expect(
      (
        await member(`/${edited.id}`, "PATCH", {
          endDate: addDays(week.startDate, 1),
        })
      ).status,
    ).toBe(200);
    await act(member, `/${edited.id}/cancel`);
    const declined = await create(member, team.workspaceId, week);
    await act(team.as(team.owner), `/${declined.id}/decline`, {
      version: declined.version,
    });
    expect(publish).toHaveBeenCalledWith(
      "time-off.request-changed",
      expect.objectContaining({ timeOffId: declined.id, status: "declined" }),
    );
    expect(scheduleEvents()).toEqual([]);
  });

  it("publishes no refresh for time off that ended before yesterday, and one for yesterday", async () => {
    const { team, refresh } = await plannedTeam();
    const member = team.as(team.member);
    const today = todayUtc();
    const past = await approve(
      team,
      await create(member, team.workspaceId, {
        startDate: addDays(today, -14),
        endDate: addDays(today, -8),
      }),
    );
    await act(team.as(team.owner), `/${past.id}/cancel`);
    expect(scheduleEvents()).toEqual([]);
    await approve(
      team,
      await create(member, team.workspaceId, {
        startDate: addDays(today, -7),
        endDate: addDays(today, -1),
      }),
    );
    expect(sorted(scheduleEvents())).toEqual([refresh]);
  });

  it("publishes no refresh when the requester has no planned work", async () => {
    const { team } = await plannedTeam();
    await approve(
      team,
      await create(team.as(team.admin), team.workspaceId, futureWeek()),
    );
    expect(publish).toHaveBeenCalledWith(
      "time-off.request-changed",
      expect.objectContaining({ userId: team.admin.id, status: "approved" }),
    );
    expect(scheduleEvents()).toEqual([]);
  });

  it("publishes no refresh when allowances or the deadline change", async () => {
    const { team } = await plannedTeam();
    const owner = team.as(team.owner);
    const allowance = `/workspace/${team.workspaceId}/allowance/vacation`;
    expect((await owner(allowance, "PUT", { days: 20 })).status).toBe(200);
    expect(
      (await owner(`${allowance}/${team.member.id}`, "PUT", { days: 30 }))
        .status,
    ).toBe(200);
    expect(
      (await owner(`${allowance}/${team.member.id}`, "DELETE")).status,
    ).toBe(200);
    expect(
      (
        await owner(`/workspace/${team.workspaceId}/settings`, "PUT", {
          holidayCalendarDeadline: todayUtc(),
        })
      ).status,
    ).toBe(200);
    expect(
      publish.mock.calls.filter(
        ([event]) => event === "time-off.settings-changed",
      ),
    ).toEqual(
      Array.from({ length: 4 }, () => [
        "time-off.settings-changed",
        { workspaceId: team.workspaceId },
      ]),
    );
    expect(scheduleEvents()).toEqual([]);
  });
});

describe("holiday calendar schedule refresh events", () => {
  const calendarEvents = () =>
    publish.mock.calls.filter(
      ([event]) => event === "time-off.holiday-calendar-changed",
    );

  const requestEvents = () =>
    publish.mock.calls.filter(
      ([event]) => event === "time-off.holiday-calendar-request-changed",
    );

  it("publishes ids only and refreshes the member's projects when their calendar changes", async () => {
    const { team, refresh } = await plannedTeam();
    const ws = team.workspaceId;
    const path = `/workspace/${ws}/holiday-calendar`;
    const member = team.as(team.member);
    const changed = [
      "time-off.holiday-calendar-changed",
      { workspaceId: ws, userId: team.member.id },
    ];
    // Every call before each clear, to check none carries the calendar.
    const history: unknown[] = [];
    const clear = () => {
      history.push(...publish.mock.calls);
      publish.mockClear();
    };
    const approve = async (request: Request) => {
      clear();
      const response = await team.as(team.owner)(
        `/workspace/${ws}/holiday-calendar-requests/${request.id}/approve`,
        "POST",
        { version: request.version },
      );
      expect(response.status).toBe(200);
    };
    const ask = async (method: string, body?: unknown) => {
      clear();
      const response = await member(path, method, body);
      expect(response.status).toBe(200);
      return (await response.json()).pendingRequest as Request;
    };

    expect(
      (await member(path, "PUT", { country: "DE", region: "BY" })).status,
    ).toBe(200);
    expect(calendarEvents()).toEqual([changed]);
    expect(sorted(scheduleEvents())).toEqual([refresh]);

    clear();
    expect(
      (await member(path, "PUT", { country: "de", region: "by" })).status,
    ).toBe(200);
    expect(publish).not.toHaveBeenCalled();

    // A later change waits for approval and moves no plans until approved.
    const country = await ask("PUT", { country: "DE" });
    expect(requestEvents()).toHaveLength(1);
    expect(calendarEvents()).toEqual([]);
    expect(scheduleEvents()).toEqual([]);
    await approve(country);
    expect(calendarEvents()).toEqual([changed]);
    expect(sorted(scheduleEvents())).toEqual([refresh]);

    const none = await ask("DELETE");
    expect(scheduleEvents()).toEqual([]);
    await approve(none);
    expect(calendarEvents()).toEqual([changed]);
    expect(sorted(scheduleEvents())).toEqual([refresh]);

    // Clearing again is a no-op now that the member has No calendar.
    clear();
    expect((await member(path, "DELETE")).status).toBe(200);
    expect(publish).not.toHaveBeenCalled();

    // Nothing about the calendar leaves the API with the events.
    expect(history.length).toBeGreaterThan(0);
    expect(JSON.stringify(history)).not.toMatch(
      /"DE"|"BY"|Germany|Bavaria|Bayern/,
    );
  });

  it("publishes no refresh when the member has no planned work", async () => {
    const { team } = await plannedTeam();
    const response = await team.as(team.owner)(
      `/workspace/${team.workspaceId}/holiday-calendar`,
      "PUT",
      { country: "FR", userId: team.admin.id },
    );
    expect(response.status).toBe(200);
    expect(calendarEvents()).toEqual([
      [
        "time-off.holiday-calendar-changed",
        { workspaceId: team.workspaceId, userId: team.admin.id },
      ],
    ]);
    expect(scheduleEvents()).toEqual([]);
  });
});
