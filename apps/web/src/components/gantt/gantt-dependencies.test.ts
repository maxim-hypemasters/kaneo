import { format, parseISO } from "date-fns";
import { describe, expect, it } from "vite-plus/test";
import {
  blockingDependencies,
  type GanttDependency,
  type GanttSpan,
  isDependencyBroken,
  planDependencyMoves,
} from "./gantt-dependencies";

const span = (start: string, end: string): GanttSpan => ({
  start: parseISO(start),
  end: parseISO(end),
});
const dep = (blockerId: string, blockedId: string): GanttDependency => ({
  id: `${blockerId}->${blockedId}`,
  blockerId,
  blockedId,
});
const dates = (value: GanttSpan | undefined) =>
  value && [format(value.start, "yyyy-MM-dd"), format(value.end, "yyyy-MM-dd")];

describe("blockingDependencies", () => {
  it("keeps blocks relations, blocker first, and drops the rest", () => {
    expect(
      blockingDependencies([
        {
          id: "r1",
          sourceTaskId: "a",
          targetTaskId: "b",
          relationType: "blocks",
        },
        {
          id: "r2",
          sourceTaskId: "a",
          targetTaskId: "c",
          relationType: "related",
        },
        {
          id: "r3",
          sourceTaskId: "a",
          targetTaskId: "d",
          relationType: "subtask",
        },
        {
          id: "r4",
          sourceTaskId: "e",
          targetTaskId: "e",
          relationType: "blocks",
        },
      ]),
    ).toEqual([{ id: "r1", blockerId: "a", blockedId: "b" }]);
  });
});

describe("isDependencyBroken", () => {
  it("lets a blocked task start on the day its blocker ends, not before", () => {
    const blocker = span("2026-03-01", "2026-03-10");
    expect(isDependencyBroken(blocker, span("2026-03-10", "2026-03-12"))).toBe(
      false,
    );
    expect(isDependencyBroken(blocker, span("2026-03-11", "2026-03-12"))).toBe(
      false,
    );
    expect(isDependencyBroken(blocker, span("2026-03-09", "2026-03-12"))).toBe(
      true,
    );
  });
});

describe("planDependencyMoves", () => {
  const spans = new Map([
    ["a", span("2026-03-01", "2026-03-05")],
    ["b", span("2026-03-05", "2026-03-08")],
    ["c", span("2026-03-08", "2026-03-10")],
    ["z", span("2026-02-20", "2026-02-25")],
  ]);
  const chain = [dep("z", "a"), dep("a", "b"), dep("b", "c")];

  it("pushes the tasks a delayed blocker blocks later, down the chain", () => {
    const plan = planDependencyMoves(
      spans,
      chain,
      "a",
      span("2026-03-03", "2026-03-07"),
    );

    expect(plan.broken.map((d) => d.id)).toEqual(["a->b"]);
    expect(
      Object.fromEntries(plan.moves.map((m) => [m.taskId, dates(m.to)])),
    ).toEqual({
      // b keeps its 3 days and now starts the day a ends; c follows b.
      b: ["2026-03-07", "2026-03-10"],
      c: ["2026-03-10", "2026-03-12"],
    });
  });

  it("pulls blockers earlier when a blocked task moves ahead of them", () => {
    const plan = planDependencyMoves(
      spans,
      chain,
      "b",
      span("2026-03-02", "2026-03-05"),
    );

    expect(plan.broken.map((d) => d.id)).toEqual(["a->b"]);
    expect(
      Object.fromEntries(plan.moves.map((m) => [m.taskId, dates(m.to)])),
    ).toEqual({
      // a now ends the day b starts; z still ends before a starts, so it
      // stays put.
      a: ["2026-02-26", "2026-03-02"],
    });
  });

  it("keeps pulling up the chain while blockers still overlap", () => {
    const tight = new Map(spans).set("z", span("2026-02-22", "2026-02-28"));
    const plan = planDependencyMoves(
      tight,
      chain,
      "b",
      span("2026-03-02", "2026-03-05"),
    );

    expect(
      Object.fromEntries(plan.moves.map((m) => [m.taskId, dates(m.to)])),
    ).toEqual({
      a: ["2026-02-26", "2026-03-02"],
      // z ended Feb 28, after a's new start: pulled 2 days earlier.
      z: ["2026-02-20", "2026-02-26"],
    });
  });

  it("does nothing when the edit keeps every dependency", () => {
    expect(
      planDependencyMoves(spans, chain, "c", span("2026-03-12", "2026-03-13")),
    ).toEqual({ broken: [], moves: [], cycle: false });
  });

  it("doesn't prompt for a dependency that was already broken", () => {
    const alreadyBroken = new Map(spans).set(
      "b",
      span("2026-03-02", "2026-03-04"),
    );
    const plan = planDependencyMoves(
      alreadyBroken,
      chain,
      "b",
      span("2026-03-01", "2026-03-03"),
    );
    expect(plan.broken).toEqual([]);
  });

  it("pushes a task blocked twice past the later of its blockers", () => {
    const diamond = new Map([
      ["a", span("2026-03-01", "2026-03-03")],
      ["b", span("2026-03-03", "2026-03-04")],
      ["c", span("2026-03-03", "2026-03-06")],
      ["d", span("2026-03-06", "2026-03-07")],
    ]);
    const plan = planDependencyMoves(
      diamond,
      [dep("a", "b"), dep("a", "c"), dep("b", "d"), dep("c", "d")],
      "a",
      span("2026-03-03", "2026-03-05"),
    );

    expect(
      Object.fromEntries(plan.moves.map((m) => [m.taskId, dates(m.to)])),
    ).toEqual({
      b: ["2026-03-05", "2026-03-06"],
      c: ["2026-03-05", "2026-03-08"],
      // c, not b, now ends last.
      d: ["2026-03-08", "2026-03-09"],
    });
  });

  it("ignores unscheduled tasks", () => {
    const plan = planDependencyMoves(
      new Map([
        ["a", span("2026-03-01", "2026-03-05")],
        ["b", span("2026-03-05", "2026-03-08")],
      ]),
      [dep("a", "b"), dep("a", "unscheduled"), dep("unscheduled", "a")],
      "a",
      span("2026-03-04", "2026-03-08"),
    );

    expect(plan.cycle).toBe(false);
    expect(plan.moves.map((m) => m.taskId)).toEqual(["b"]);
  });

  it("moves tasks in a loop along, keeping the loop's old overlap", () => {
    const plan = planDependencyMoves(
      new Map([
        ["a", span("2026-03-01", "2026-03-05")],
        ["b", span("2026-03-05", "2026-03-08")],
        ["c", span("2026-03-08", "2026-03-10")],
      ]),
      // c -> a was already broken: c ends 9 days after a starts.
      [dep("a", "b"), dep("b", "c"), dep("c", "a")],
      "a",
      span("2026-03-04", "2026-03-08"),
    );

    expect(plan.cycle).toBe(false);
    expect(
      Object.fromEntries(plan.moves.map((m) => [m.taskId, dates(m.to)])),
    ).toEqual({
      b: ["2026-03-08", "2026-03-11"],
      // Still ends 9 days after a starts, no worse than before.
      c: ["2026-03-11", "2026-03-13"],
    });
  });

  it("moves nothing when the moves would come back round to the edited task", () => {
    const plan = planDependencyMoves(
      new Map([
        ["a", span("2026-03-01", "2026-03-05")],
        ["b", span("2026-03-05", "2026-03-08")],
        ["c", span("2026-03-08", "2026-03-10")],
      ]),
      [dep("a", "b"), dep("b", "c"), dep("c", "a")],
      "a",
      // a now ends later but still starts Mar 1, so pushing b and c later
      // would make c end even further past a's start.
      span("2026-03-01", "2026-03-08"),
    );

    expect(plan.broken.map((d) => d.id)).toEqual(["a->b"]);
    expect(plan).toMatchObject({ moves: [], cycle: true });
  });

  it("ignores a loop the moves never reach", () => {
    const loopBehindSpareTime = planDependencyMoves(
      new Map([
        ["a", span("2026-03-01", "2026-03-05")],
        ["b", span("2026-03-05", "2026-03-08")],
        ["c", span("2026-04-20", "2026-04-21")],
        ["d", span("2026-04-22", "2026-04-23")],
        ["e", span("2026-04-24", "2026-04-25")],
      ]),
      [
        dep("a", "b"),
        dep("b", "c"),
        dep("c", "d"),
        dep("d", "e"),
        dep("e", "c"),
      ],
      "a",
      span("2026-03-02", "2026-03-06"),
    );
    const loopUpstream = planDependencyMoves(
      new Map([
        ["p", span("2026-02-01", "2026-02-02")],
        ["q", span("2026-02-03", "2026-02-04")],
        ["r", span("2026-02-05", "2026-02-06")],
        ["a", span("2026-03-01", "2026-03-05")],
        ["b", span("2026-03-05", "2026-03-08")],
      ]),
      [
        dep("p", "q"),
        dep("q", "r"),
        dep("r", "p"),
        dep("r", "a"),
        dep("a", "b"),
      ],
      "a",
      span("2026-03-02", "2026-03-06"),
    );

    for (const plan of [loopBehindSpareTime, loopUpstream]) {
      expect(plan.cycle).toBe(false);
      expect(plan.moves.map((m) => [m.taskId, dates(m.to)])).toEqual([
        ["b", ["2026-03-06", "2026-03-09"]],
      ]);
    }
  });

  it("leaves old overlaps the edit didn't change alone", () => {
    const plan = planDependencyMoves(
      new Map([
        ["z", span("2026-02-20", "2026-03-01")],
        ["a", span("2026-03-01", "2026-03-10")],
        // Already overlaps a, on purpose or not.
        ["b", span("2026-03-05", "2026-03-08")],
        ["c", span("2026-03-08", "2026-03-09")],
      ]),
      [dep("z", "a"), dep("a", "b"), dep("b", "c")],
      "a",
      // Only the start moves earlier, past z's end.
      span("2026-02-27", "2026-03-10"),
    );

    expect(plan.broken.map((d) => d.id)).toEqual(["z->a"]);
    expect(plan.moves.map((m) => [m.taskId, dates(m.to)])).toEqual([
      ["z", ["2026-02-18", "2026-02-27"]],
    ]);
  });

  it("keeps passing on only the overlap a move adds", () => {
    const plan = planDependencyMoves(
      new Map([
        ["a", span("2026-03-01", "2026-03-05")],
        ["b", span("2026-03-05", "2026-03-08")],
        // Starts a day before b ends already.
        ["c", span("2026-03-07", "2026-03-09")],
      ]),
      [dep("a", "b"), dep("b", "c")],
      "a",
      span("2026-03-03", "2026-03-07"),
    );

    expect(
      Object.fromEntries(plan.moves.map((m) => [m.taskId, dates(m.to)])),
    ).toEqual({
      b: ["2026-03-07", "2026-03-10"],
      // Pushed as far as b moved, so it still overlaps b by one day.
      c: ["2026-03-09", "2026-03-11"],
    });
  });

  it("still counts a held conflict that someone else's change made look old", () => {
    // a was dragged to Mar 3-7, breaking a -> b; meanwhile b moved to start
    // Mar 4, so against the latest dates a -> b was already broken.
    const latest = new Map(spans).set("b", span("2026-03-04", "2026-03-07"));
    const edit = span("2026-03-03", "2026-03-07");

    expect(planDependencyMoves(latest, chain, "a", edit).broken).toEqual([]);
    const plan = planDependencyMoves(
      latest,
      chain,
      "a",
      edit,
      new Set(["a->b"]),
    );
    expect(plan.broken.map((d) => d.id)).toEqual(["a->b"]);
    expect(plan.moves.map((m) => [m.taskId, dates(m.to)])).toContainEqual([
      "b",
      ["2026-03-07", "2026-03-10"],
    ]);
  });
});
