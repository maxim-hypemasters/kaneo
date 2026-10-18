import { describe, expect, it } from "vite-plus/test";
import { buildProgressSeries } from "./build-progress-series";
import type { StatusChange, WorkflowChange } from "./types";

const column = (
  id: number,
  slug: string,
  position: number,
  isFinal = false,
): WorkflowChange => ({
  id,
  columnId: slug,
  slug,
  position,
  isFinal,
  present: true,
  date: "2026-10-01",
});
const workflow = [
  column(1, "todo", 0),
  column(2, "doing", 1),
  column(3, "done", 2, true),
];
function series(
  statusChanges: StatusChange[] = [],
  workflowChanges = workflow,
  options = {},
) {
  return buildProgressSeries({
    startDate: "2026-10-01",
    submissionDate: "2026-10-04",
    trackingDay: "2026-10-01",
    today: "2026-10-05",
    statusChanges,
    workflowChanges,
    ...options,
  });
}
const change = (date: string, status: string, delta: number) => ({
  date,
  status,
  delta,
});

describe("release progress history", () => {
  it("records scope, starts, completions, reopening and deletion without rewriting earlier days", () => {
    const result = series([
      change("2026-10-01", "todo", 2),
      change("2026-10-02", "todo", -1),
      change("2026-10-02", "doing", 1),
      change("2026-10-03", "doing", -1),
      change("2026-10-03", "done", 1),
      change("2026-10-04", "done", -1),
      change("2026-10-04", "doing", 1),
      change("2026-10-05", "todo", -1),
    ]);
    expect(result.points).toEqual([
      { date: "2026-10-01", scope: 2, started: 0, completed: 0 },
      { date: "2026-10-02", scope: 2, started: 1, completed: 0 },
      { date: "2026-10-03", scope: 2, started: 1, completed: 1 },
      { date: "2026-10-04", scope: 2, started: 1, completed: 0 },
      { date: "2026-10-05", scope: 1, started: 1, completed: 0 },
    ]);
    expect(result.current).toEqual({ scope: 1, started: 1, completed: 0 });
  });

  it("keeps archived, planned and unknown statuses in scope but unstarted", () => {
    expect(
      series(
        ["archived", "planned", "unknown", "todo", "doing", "done"].map(
          (status) => change("2026-10-01", status, 1),
        ),
      ).current,
    ).toEqual({ scope: 6, started: 2, completed: 1 });
  });

  it("applies workflow final and order changes from their effective day", () => {
    const result = series(
      [change("2026-10-01", "doing", 2)],
      [
        ...workflow,
        { ...column(4, "doing", 1, true), date: "2026-10-02" },
        { ...column(5, "doing", -1), date: "2026-10-03" },
        { ...column(6, "doing", -1), present: false, date: "2026-10-04" },
      ],
    );
    expect(
      result.points.map(({ started, completed }) => [started, completed]),
    ).toEqual([
      [2, 0],
      [2, 2],
      [0, 0],
      [0, 0],
    ]);
  });

  it("carries pre-start totals into the start without inventing pre-tracking points", () => {
    const changes = [change("2026-10-01", "done", 3)];
    expect(
      series(changes, workflow, { trackingDay: "2026-10-03" }).points[0],
    ).toEqual({ date: "2026-10-03", scope: 3, started: 3, completed: 3 });
    expect(
      series(changes, workflow, { startDate: "2026-10-03" }).points[0]?.date,
    ).toBe("2026-10-03");
    const upcoming = series(changes, workflow, { startDate: "2026-11-01" });
    expect(upcoming.points).toEqual([]);
    expect(upcoming.current.scope).toBe(3);
  });

  it("fills calendar gaps and trims only unchanged days after submission", () => {
    const result = series(
      [change("2026-10-01", "todo", 1), change("2026-10-07", "doing", 1)],
      workflow,
      { today: "2026-10-10" },
    );
    expect(result.points).toHaveLength(7);
    expect(result.points.at(-1)).toMatchObject({
      date: "2026-10-07",
      scope: 2,
      started: 1,
    });
    expect(series().points).toHaveLength(4);
  });

  it("uses deterministic column order and includes completed when there is no nonfinal column", () => {
    const tied = [
      column(2, "z", 0),
      column(1, "a", 0),
      column(3, "done", -1, true),
    ];
    expect(
      series(
        [
          change("2026-10-01", "a", 1),
          change("2026-10-01", "z", 1),
          change("2026-10-01", "done", 1),
        ],
        tied,
      ).current,
    ).toEqual({ scope: 3, started: 2, completed: 1 });
    expect(
      series([change("2026-10-01", "done", 1)], [column(1, "done", 0, true)])
        .current,
    ).toEqual({ scope: 1, started: 1, completed: 1 });
  });
});
