import { describe, expect, it } from "vite-plus/test";
import { buildSchedule } from "./build-schedule";
import type { PlanningCalendar, PlanningTask, ScheduleInput } from "./types";

const monday = "2026-10-26T09:00:00.000Z";
const calendar: PlanningCalendar = {
  assigneeId: "member",
  timeZone: "UTC",
  weeklyIntervals: [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startMinute: 9 * 60,
    endMinute: 17 * 60,
  })),
  timeOff: [],
};

function task(id: string, overrides: Partial<PlanningTask> = {}): PlanningTask {
  return {
    id,
    assigneeId: "member",
    priority: "medium",
    position: 0,
    state: "todo",
    estimateSeconds: 3600,
    loggedSeconds: 0,
    releaseId: null,
    ...overrides,
  };
}

function input(
  tasks: PlanningTask[],
  overrides: Partial<ScheduleInput> = {},
): ScheduleInput {
  return {
    tasks,
    asOf: monday,
    planFrom: monday,
    timeZone: "UTC",
    calendars: [calendar],
    releases: [],
    dependencies: [],
    ...overrides,
  };
}

function byId(result: ReturnType<typeof buildSchedule>, id: string) {
  return result.tasks.find((item) => item.id === id)!;
}

describe("buildSchedule", () => {
  it("subtracts all logged effort and respects minute estimates without changing the input", () => {
    const source = input([
      task("task", { estimateSeconds: 5400, loggedSeconds: 1800 }),
      task("bug", {
        estimateSeconds: 90 * 60,
        loggedSeconds: 15 * 60,
        position: 1,
      }),
    ]);
    const before = structuredClone(source);
    const result = buildSchedule(source);
    expect(byId(result, "task").segments).toEqual([
      { start: monday, end: "2026-10-26T10:00:00.000Z" },
    ]);
    expect(byId(result, "bug").end).toBe("2026-10-26T11:15:00.000Z");
    expect(source).toEqual(before);
  });

  it("uses active work then priority, manual order, and a stable ID tie-break", () => {
    const result = buildSchedule(
      input([
        task("urgent", { priority: "urgent", position: 100 }),
        task("active", { priority: "no-priority", state: "active" }),
        task("b", { priority: "low", position: 1 }),
        task("a", { priority: "low", position: 1 }),
        task("ordered", { priority: "low", position: 0 }),
      ]),
    );
    expect(byId(result, "active").start).toBe(monday);
    expect(byId(result, "urgent").start).toBe("2026-10-26T10:00:00.000Z");
    expect(byId(result, "ordered").start).toBe("2026-10-26T11:00:00.000Z");
    expect(byId(result, "a").start).toBe("2026-10-26T12:00:00.000Z");
    expect(byId(result, "b").start).toBe("2026-10-26T13:00:00.000Z");
  });

  it("inherits urgency through blockers and runs independent assignees concurrently", () => {
    const result = buildSchedule(
      input(
        [
          task("normal", { priority: "high" }),
          task("prerequisite", { priority: "low" }),
          task("critical", { state: "active", assigneeId: "other" }),
        ],
        {
          calendars: [calendar, { ...calendar, assigneeId: "other" }],
          dependencies: [{ blockerId: "prerequisite", blockedId: "critical" }],
        },
      ),
    );
    expect(byId(result, "prerequisite").start).toBe(monday);
    expect(byId(result, "critical").start).toBe("2026-10-26T10:00:00.000Z");
    expect(byId(result, "normal").start).toBe("2026-10-26T10:00:00.000Z");
  });

  it("spans breaks, weekends, and dated time off as working segments", () => {
    const result = buildSchedule(
      input([task("long", { estimateSeconds: 7 * 3600 })], {
        asOf: "2026-10-30T14:00:00.000Z",
        planFrom: "2026-10-30T14:00:00.000Z",
        calendars: [
          {
            ...calendar,
            weeklyIntervals: [1, 2, 3, 4, 5].flatMap((weekday) => [
              { weekday, startMinute: 9 * 60, endMinute: 12 * 60 },
              { weekday, startMinute: 13 * 60, endMinute: 17 * 60 },
            ]),
            timeOff: [
              { start: "2026-11-02T10:00:00Z", end: "2026-11-02T14:00:00Z" },
            ],
          },
        ],
      }),
    );
    expect(byId(result, "long").segments).toEqual([
      { start: "2026-10-30T14:00:00.000Z", end: "2026-10-30T17:00:00.000Z" },
      { start: "2026-11-02T09:00:00.000Z", end: "2026-11-02T10:00:00.000Z" },
      { start: "2026-11-02T14:00:00.000Z", end: "2026-11-02T17:00:00.000Z" },
    ]);
  });

  it("fills an earlier gap only if the complete lower-priority task fits", () => {
    const tasks = [
      task("reserved", {
        priority: "urgent",
        releaseId: "later",
        estimateSeconds: 4 * 3600,
      }),
      task("small", { priority: "medium", estimateSeconds: 4 * 3600 }),
      task("large", { priority: "low", estimateSeconds: 6 * 3600 }),
    ];
    const result = buildSchedule(
      input(tasks, {
        releases: [
          {
            id: "later",
            startDate: "2026-10-27",
            codeFreezeDate: "2026-11-01",
            submissionDate: "2026-11-02",
          },
        ],
      }),
    );
    expect(byId(result, "reserved").start).toBe("2026-10-27T09:00:00.000Z");
    expect(byId(result, "small").start).toBe(monday);
    expect(byId(result, "large").segments).toEqual([
      { start: "2026-10-27T13:00:00.000Z", end: "2026-10-27T17:00:00.000Z" },
      { start: "2026-10-28T09:00:00.000Z", end: "2026-10-28T11:00:00.000Z" },
    ]);
  });

  it("reports unfinished exclusions without completing exhausted work", () => {
    const result = buildSchedule(
      input(
        [
          task("backlog", { state: "backlog" }),
          task("archived", { state: "archived" }),
          task("unassigned", { assigneeId: null }),
          task("unestimated", { estimateSeconds: null }),
          task("exhausted", { loggedSeconds: 4000 }),
          task("no-calendar", { assigneeId: "unknown" }),
          task("done", { state: "done" }),
          task("dependent"),
        ],
        {
          dependencies: [{ blockerId: "exhausted", blockedId: "dependent" }],
        },
      ),
    );
    expect(result.tasks.map((item) => [item.id, item.reason])).toEqual([
      ["archived", "archived"],
      ["backlog", "backlog"],
      ["dependent", "blocked_dependency"],
      ["exhausted", "estimate_exhausted"],
      ["no-calendar", "no_calendar"],
      ["unassigned", "unassigned"],
      ["unestimated", "no_estimate"],
    ]);
    expect(
      result.tasks.every((item) => item.start === null && item.end === null),
    ).toBe(true);
  });

  it("satisfies completed blockers and blocks archived or unresolved work", () => {
    const result = buildSchedule(
      input(
        [
          task("done", { state: "done" }),
          task("ok"),
          task("archived", { state: "archived" }),
          task("bad"),
        ],
        {
          dependencies: [
            { blockerId: "done", blockedId: "ok" },
            { blockerId: "archived", blockedId: "bad" },
          ],
        },
      ),
    );
    expect(byId(result, "ok").start).toBe(monday);
    expect(byId(result, "bad").reason).toBe("blocked_dependency");
  });

  it("distinguishes cycles from downstream blocked work, including self-cycles", () => {
    const result = buildSchedule(
      input(
        [task("a"), task("b"), task("downstream"), task("self"), task("ok")],
        {
          dependencies: [
            { blockerId: "a", blockedId: "b" },
            { blockerId: "b", blockedId: "a" },
            { blockerId: "b", blockedId: "downstream" },
            { blockerId: "self", blockedId: "self" },
          ],
        },
      ),
    );
    expect(byId(result, "a").reason).toBe("dependency_cycle");
    expect(byId(result, "b").reason).toBe("dependency_cycle");
    expect(byId(result, "self").reason).toBe("dependency_cycle");
    expect(byId(result, "downstream").reason).toBe("blocked_dependency");
    expect(byId(result, "ok").start).toBe(monday);
  });

  it("uses only available external applied ends and exposes no blocker metadata", () => {
    const result = buildSchedule(
      input(
        [task("ok"), task("private"), task("missing"), task("external-done")],
        {
          dependencies: [
            { blockerId: "external", blockedId: "ok" },
            { blockerId: "secret", blockedId: "private" },
            { blockerId: "unknown", blockedId: "missing" },
            { blockerId: "complete", blockedId: "external-done" },
          ],
          externalBlockers: [
            {
              id: "external",
              available: true,
              state: "unfinished",
              appliedEnd: "2026-10-27T12:00:00Z",
            },
            {
              id: "secret",
              available: false,
              state: "unfinished",
              appliedEnd: "2026-10-29T12:00:00Z",
            },
            {
              id: "complete",
              available: true,
              state: "done",
              appliedEnd: null,
            },
          ],
        },
      ),
    );
    expect(byId(result, "ok").start).toBe("2026-10-27T12:00:00.000Z");
    expect(byId(result, "private").reason).toBe(
      "external_dependency_unavailable",
    );
    expect(byId(result, "missing").reason).toBe(
      "external_dependency_unavailable",
    );
    expect(byId(result, "external-done").start).toBe(monday);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("uses project-local release boundaries and warns after their full local days", () => {
    const result = buildSchedule(
      input([task("release", { releaseId: "r", estimateSeconds: 16 * 3600 })], {
        timeZone: "Pacific/Auckland",
        calendars: [{ ...calendar, timeZone: "Pacific/Auckland" }],
        releases: [
          {
            id: "r",
            startDate: "2026-10-28",
            codeFreezeDate: "2026-10-28",
            submissionDate: "2026-10-28",
          },
        ],
      }),
    );
    expect(byId(result, "release").start).toBe("2026-10-27T20:00:00.000Z");
    expect(byId(result, "release").end).toBe("2026-10-29T04:00:00.000Z");
    expect(result.warnings).toEqual([
      { taskId: "release", code: "after_code_freeze", releaseId: "r" },
      { taskId: "release", code: "after_submission", releaseId: "r" },
    ]);
  });

  it("clamps past plan starts and honors future starts", () => {
    expect(
      buildSchedule(input([task("a")], { planFrom: "2026-10-25T09:00:00Z" }))
        .planFrom,
    ).toBe(monday);
    const result = buildSchedule(
      input([task("a")], { planFrom: "2026-10-27T14:30:00Z" }),
    );
    expect(byId(result, "a").start).toBe("2026-10-27T14:30:00.000Z");
  });

  it("produces the same schedule when snapshot row order changes or edges duplicate", () => {
    const source = input(
      [task("c"), task("b", { assigneeId: "other" }), task("a")],
      {
        calendars: [calendar, { ...calendar, assigneeId: "other" }],
        dependencies: [
          { blockerId: "a", blockedId: "b" },
          { blockerId: "a", blockedId: "b" },
        ],
      },
    );
    expect(
      buildSchedule({ ...source, tasks: [...source.tasks].reverse() }),
    ).toEqual(buildSchedule(source));
  });

  it("bounds impossible allocation without a per-minute scan", () => {
    const result = buildSchedule(
      input([task("too-large", { estimateSeconds: 100_000_000_000 })], {
        calendars: [
          {
            ...calendar,
            weeklyIntervals: [
              { weekday: 1, startMinute: 9 * 60, endMinute: 9 * 60 + 1 },
            ],
          },
        ],
      }),
    );
    expect(byId(result, "too-large").reason).toBe("outside_planning_horizon");
  });
});
