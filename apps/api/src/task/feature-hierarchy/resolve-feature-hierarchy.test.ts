import { describe, expect, it } from "vite-plus/test";
import {
  type HierarchyTask,
  pairKey,
  resolveFeatureHierarchy,
  type SubtaskEdge,
} from "./resolve-feature-hierarchy";

const task = (
  id: string,
  type = "task",
  featureId: string | null = null,
): HierarchyTask => ({ id, type, featureId });

let clock = 0;
const edge = (
  sourceTaskId: string,
  targetTaskId: string,
  id = `${sourceTaskId}->${targetTaskId}`,
): SubtaskEdge => {
  clock += 1;
  return { id, sourceTaskId, targetTaskId, createdAt: new Date(clock * 1000) };
};

const resolve = (
  tasks: HierarchyTask[],
  edges: SubtaskEdge[],
  relatedPairs: string[] = [],
) => {
  const plan = resolveFeatureHierarchy({
    tasks,
    edges,
    relatedPairs: new Set(relatedPairs),
  });
  return {
    features: [...plan.features].sort(),
    memberships: Object.fromEntries(plan.memberships),
    outcomes: Object.fromEntries(plan.outcomes),
  };
};

describe("resolveFeatureHierarchy", () => {
  it("makes a parent a feature and its subtasks its tasks", () => {
    expect(
      resolve(
        [task("p"), task("a"), task("b")],
        [edge("p", "a"), edge("p", "b")],
      ),
    ).toEqual({
      features: ["p"],
      memberships: { a: "p", b: "p" },
      outcomes: { "p->a": "membership", "p->b": "membership" },
    });
  });

  it("flattens deeper levels into the top feature and keeps them related", () => {
    expect(
      resolve(
        [task("epic"), task("story"), task("sub")],
        [edge("epic", "story"), edge("story", "sub")],
      ),
    ).toEqual({
      features: ["epic"],
      memberships: { story: "epic", sub: "epic" },
      outcomes: { "epic->story": "membership", "story->sub": "related" },
    });
  });

  it("gives a task with several parents to the oldest link", () => {
    expect(
      resolve(
        [task("p1"), task("p2"), task("c")],
        [edge("p1", "c"), edge("p2", "c")],
      ),
    ).toEqual({
      // p2 loses its only task, so it stays a task.
      features: ["p1"],
      memberships: { c: "p1" },
      outcomes: { "p1->c": "membership", "p2->c": "related" },
    });
  });

  it("prefers the shallowest path over an older, deeper one", () => {
    const plan = resolve(
      [task("r1"), task("a"), task("b"), task("r2")],
      [edge("a", "b"), edge("r1", "a"), edge("r2", "b")],
    );

    expect(plan.features).toEqual(["r1", "r2"]);
    expect(plan.memberships).toEqual({ a: "r1", b: "r2" });
    expect(plan.outcomes["a->b"]).toBe("related");
  });

  it("keeps links to other projects as related ones", () => {
    expect(
      resolve(
        [task("p")],
        [edge("p", "elsewhere"), edge("p", "known")],
        [pairKey("known", "p")],
      ),
    ).toEqual({
      features: [],
      memberships: {},
      // An existing related link already covers p and known.
      outcomes: { "p->elsewhere": "related", "p->known": "dropped" },
    });
  });

  it("drops duplicates, reversed pairs and self links", () => {
    expect(
      resolve(
        [task("a"), task("b")],
        [
          edge("a", "b", "first"),
          edge("a", "b", "again"),
          edge("b", "a", "reversed"),
          edge("a", "a", "self"),
        ],
      ),
    ).toEqual({
      features: ["a"],
      memberships: { b: "a" },
      outcomes: {
        first: "membership",
        again: "dropped",
        reversed: "dropped",
        self: "dropped",
      },
    });
  });

  it("makes no feature out of tasks that only point at each other", () => {
    expect(
      resolve(
        [task("a"), task("b"), task("c")],
        [edge("a", "b"), edge("b", "c"), edge("c", "a")],
      ),
    ).toEqual({
      features: [],
      memberships: {},
      outcomes: { "a->b": "related", "b->c": "related", "c->a": "related" },
    });
  });

  it("keeps what is already converted and builds on it", () => {
    expect(
      resolve(
        [
          task("f", "feature"),
          task("x", "task", "f"),
          task("y"),
          task("z"),
          task("q"),
        ],
        // Written by an old server after the first conversion.
        [edge("x", "y"), edge("f", "z"), edge("q", "f")],
      ),
    ).toEqual({
      features: [],
      memberships: { y: "f", z: "f" },
      outcomes: {
        "x->y": "related",
        "f->z": "membership",
        // A feature never joins another feature.
        "q->f": "related",
      },
    });
  });

  it("never moves a task out of the feature it already has", () => {
    expect(
      resolve(
        [task("g", "feature"), task("x", "task", "g"), task("p"), task("c")],
        [edge("p", "x"), edge("p", "c")],
      ),
    ).toEqual({
      features: ["p"],
      memberships: { c: "p" },
      outcomes: { "p->x": "related", "p->c": "membership" },
    });
  });

  it("keeps an existing related link next to a membership", () => {
    const plan = resolve(
      [task("p"), task("a")],
      [edge("p", "a")],
      [pairKey("p", "a")],
    );

    expect(plan.outcomes["p->a"]).toBe("membership");
  });
});
