import { describe, expect, it } from "vite-plus/test";
import {
  finalStatuses,
  releaseProgress,
  startedStatuses,
} from "./release-progress";

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
      completedFeatures: 0,
      unfinished: 3,
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

  it("counts Bugs with Tasks, including completed and archived Bugs", () => {
    expect(
      releaseProgress(
        [
          { type: "task", status: "todo" },
          { type: "bug", status: "done" },
          { type: "bug", status: "archived" },
        ],
        done,
      ),
    ).toEqual({
      tasks: 3,
      completedTasks: 1,
      features: 0,
      completedFeatures: 0,
      unfinished: 1,
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

describe("startedStatuses", () => {
  it("uses position then real column id to choose the first nonfinal column", () => {
    expect([
      ...startedStatuses([
        { id: "b", slug: "z-review", position: 1, isFinal: false },
        { id: "a", slug: "z-todo", position: 1, isFinal: false },
        { id: "c", slug: "a-active", position: 2, isFinal: false },
        { id: "d", slug: "done", position: 0, isFinal: true },
      ]),
    ]).toEqual(["done", "z-review", "a-active"]);
  });
  it("includes every Done column but excludes backlog and archived statuses", () => {
    expect([
      ...startedStatuses([
        { id: "a", slug: "to-do", position: 0, isFinal: false },
        { id: "b", slug: "planned", position: 1, isFinal: false },
        { id: "c", slug: "archived", position: 2, isFinal: false },
        { id: "d", slug: "done", position: 3, isFinal: true },
        { id: "e", slug: "shipped", position: 4, isFinal: true },
      ]),
    ]).toEqual(["done", "shipped"]);
    expect([...startedStatuses([])]).toEqual([]);
  });
});
