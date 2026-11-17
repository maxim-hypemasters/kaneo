import { renderHook } from "@testing-library/react";
import { parseISO } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { formatReleaseDate } from "@/lib/releases/release-date";
import type { AwayDaysByUser } from "@/lib/time-off/away-days";
import type {
  GanttTaskEdit,
  ScheduledLeaf,
  ScheduledMilestone,
} from "../gantt-types";
import { buildGanttTimeline } from "../timeline";
import { useGanttAway } from "./use-gantt-away";

const m = vi.hoisted(() => ({
  byUser: new Map() as AwayDaysByUser,
  windows: undefined as unknown,
}));

vi.mock("@/hooks/queries/time-off/use-away-days", () => ({
  useAwayDays: (_workspaceId: string, windows: unknown) => {
    m.windows = windows;
    return {
      byUser: m.byUser,
      isPending: false,
      isError: false,
      retry: vi.fn(),
    };
  },
}));
vi.mock("@/lib/releases/use-release-today", () => ({
  useReleaseToday: () => "2026-08-31",
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));

// Sep 1-30, 2026.
const timeline = buildGanttTimeline(
  { start: parseISO("2026-09-01"), end: parseISO("2026-09-30") },
  2.75,
);
const members = [{ id: "ann", name: "Ann" }];
const task = (overrides: Partial<ScheduledLeaf> = {}) =>
  ({
    id: "t1",
    userId: "ann",
    startDate: "2026-09-01",
    dueDate: "2026-09-03",
    featureId: null,
    milestoneId: null,
    scheduleStart: parseISO("2026-09-01"),
    scheduleEnd: parseISO("2026-09-03"),
    ...overrides,
  }) as ScheduledLeaf;
const resize = (end: string): GanttTaskEdit => ({
  start: parseISO("2026-09-01"),
  end: parseISO(end),
  userId: "ann",
  featureId: null,
  milestoneId: null,
  exact: true,
});

beforeEach(() => {
  m.byUser = new Map([
    [
      "ann",
      new Map([
        ["2026-09-07", { kind: "vacation" as const }],
        ["2026-09-08", { kind: "vacation" as const }],
      ]),
    ],
  ]);
});

const render = () =>
  renderHook(() => useGanttAway("workspace", timeline, members)).result.current;

describe("useGanttAway", () => {
  it("loads the rendered days and lays the runs out from the first one", () => {
    const away = render();
    expect(m.windows).toEqual([{ from: "2026-09-01", to: "2026-09-30" }]);
    expect(away.runsFor("ann")).toEqual([{ from: 6, to: 8, kind: "vacation" }]);
    expect(away.runsFor("bo")).toEqual([]);
    expect(away.runsFor(null)).toEqual([]);
  });

  it("names who is away and when for an edit that can't save", () => {
    const away = render();
    expect(away.refusal(task(), resize("2026-09-08"))).toEqual({
      name: "Ann",
      date: formatReleaseDate("2026-09-08", { today: "2026-08-31" }),
    });
    expect(away.refusal(task(), resize("2026-09-09"))).toBeNull();
  });

  it("gives Task and Bug bars their runs and a hint, and milestones nothing", () => {
    const away = render();
    const bar = away.barFor(task());
    expect(bar?.runs).toEqual([{ from: 6, to: 8, kind: "vacation" }]);
    expect(bar?.name).toBe("Ann");
    expect(bar?.blockedHint(resize("2026-09-07"))).toBe(
      `tasks:gantt.away.blockedHint ${JSON.stringify({
        name: "Ann",
        date: formatReleaseDate("2026-09-07", { today: "2026-08-31" }),
      })}`,
    );
    expect(bar?.blockedHint(resize("2026-09-05"))).toBeNull();
    // Unassigned work can still be dropped on someone away.
    expect(away.barFor(task({ userId: null }))?.runs).toEqual([]);
    expect(
      away.barFor({
        ...task(),
        entityKind: "milestone",
      } as unknown as ScheduledMilestone),
    ).toBeUndefined();
  });

  it("leaves bars alone while nobody is away", () => {
    m.byUser = new Map();
    expect(render().barFor(task())).toBeUndefined();
  });

  it("loads nothing before the timeline is laid out", () => {
    renderHook(() => useGanttAway("workspace", null, members));
    expect(m.windows).toEqual([]);
  });
});
