import { describe, expect, it } from "vite-plus/test";
import type Task from "@/types/task";
import {
  getReleaseWorkProgress,
  groupReleaseMilestones,
} from "./release-milestone-groups";

const task = (id: string, values: Partial<Task> = {}) =>
  ({
    id,
    title: id,
    type: "task",
    status: "todo",
    featureId: "feature",
    releaseId: "release",
    ...values,
  }) as Task;
const done = new Set(["done", "shipped"]);
const started = new Set(["in-progress", "review"]);
const milestone = (id: string, position: number) => ({
  id,
  featureId: "feature",
  title: id,
  position,
});

describe("getReleaseWorkProgress", () => {
  it("counts Tasks and Bugs, includes completed work as started, and leaves archived and Features out", () => {
    expect(
      getReleaseWorkProgress(
        [
          task("todo"),
          task("planned", { status: "planned" }),
          task("unknown", { status: "unknown" }),
          task("started", { status: "in-progress" }),
          task("review", { status: "review", type: "bug" }),
          task("done", { status: "done" }),
          task("shipped", { status: "shipped", type: "bug" }),
          task("archived", { status: "archived" }),
          task("feature", { type: "feature", status: "done" }),
        ],
        done,
        started,
      ),
    ).toEqual({ total: 7, started: 4, completed: 2 });
  });
  it("uses the current workflow for completion and reopening without relying on Feature status", () => {
    const work = [task("task", { status: "review" })];
    expect(getReleaseWorkProgress(work, done, started)).toEqual({
      total: 1,
      started: 1,
      completed: 0,
    });
    expect(
      getReleaseWorkProgress(work, new Set(["review"]), new Set()),
    ).toEqual({ total: 1, started: 1, completed: 1 });
    expect(getReleaseWorkProgress([], done, started)).toEqual({
      total: 0,
      started: 0,
      completed: 0,
    });
  });
});

describe("groupReleaseMilestones", () => {
  it("sorts definitions by position then ID, preserves unfinished-first input order in each bucket, and puts No milestone last", () => {
    const tasks = [
      task("b open", { milestoneId: "b" }),
      task("a open", { milestoneId: "a" }),
      task("none"),
      task("b done", { milestoneId: "b", status: "done" }),
      task("a done", { milestoneId: "a", status: "done", type: "bug" }),
    ];
    const result = groupReleaseMilestones(tasks, [
      milestone("b", 1),
      milestone("empty", 0),
      milestone("a", 1),
    ]);
    expect(
      result?.map((group) => [
        group.milestone?.id ?? null,
        group.tasks.map((item) => item.id),
      ]),
    ).toEqual([
      ["a", ["a open", "a done"]],
      ["b", ["b open", "b done"]],
      [null, ["none"]],
    ]);
  });
  it("groups unassigned work even when every owned milestone is empty", () => {
    expect(
      groupReleaseMilestones([task("none")], [milestone("empty", 0)]),
    ).toEqual([{ milestone: null, tasks: [task("none")] }]);
  });
  it("returns a flat-list fallback for unloaded definitions, Features without milestones, and stale task assignments", () => {
    expect(groupReleaseMilestones([task("task")], undefined)).toBeNull();
    expect(groupReleaseMilestones([task("task")], [])).toBeNull();
    expect(
      groupReleaseMilestones(
        [task("task", { milestoneId: "deleted" })],
        [milestone("m1", 1)],
      ),
    ).toBeNull();
  });
  it("does not expose groups occupied only by archived work", () => {
    expect(
      groupReleaseMilestones(
        [task("archived", { status: "archived", milestoneId: "deleted" })],
        [milestone("m1", 0)],
      ),
    ).toEqual([]);
  });
});
