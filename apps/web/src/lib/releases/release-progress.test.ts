import { describe, expect, it } from "vite-plus/test";
import { finalStatuses, releaseProgress } from "./release-progress";

describe("releaseProgress", () => {
  const done = finalStatuses([
    { slug: "todo", isFinal: false },
    { slug: "done", isFinal: true },
    { slug: "shipped", isFinal: true },
  ]);

  it("counts tasks, features and unfinished items", () => {
    expect(
      releaseProgress(
        [
          { type: "task", status: "done" },
          { type: "task", status: "shipped" },
          { type: "task", status: "todo" },
          { type: "task", status: "planned" },
          { type: undefined, status: "todo" },
          { type: "feature", status: "done" },
          { type: "feature", status: "todo" },
        ],
        done,
      ),
    ).toEqual({
      tasks: 5,
      completedTasks: 2,
      features: 2,
      completedFeatures: 1,
      unfinished: 4,
    });
  });

  it("counts archived items in the totals but never as unfinished", () => {
    expect(
      releaseProgress(
        [
          { type: "task", status: "archived" },
          { type: "feature", status: "archived" },
        ],
        done,
      ),
    ).toEqual({
      tasks: 1,
      completedTasks: 0,
      features: 1,
      completedFeatures: 0,
      unfinished: 0,
    });
  });

  it("is all zeros for an empty release", () => {
    expect(releaseProgress([], done)).toEqual({
      tasks: 0,
      completedTasks: 0,
      features: 0,
      completedFeatures: 0,
      unfinished: 0,
    });
  });
});

describe("finalStatuses", () => {
  it("keeps the slugs of final columns", () => {
    expect([
      ...finalStatuses([
        { slug: "todo", isFinal: false },
        { slug: "done", isFinal: true },
      ]),
    ]).toEqual(["done"]);
  });
});
