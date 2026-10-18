import { expect, it } from "vite-plus/test";
import { getFeatureIndex } from "@/lib/features/feature-index";
import type Task from "@/types/task";
import { groupReleaseItems } from "./group-release-items";

const item = (id: string, values: Partial<Task> = {}) =>
  ({
    id,
    title: id,
    status: "to-do",
    projectId: "p",
    type: "task",
    featureId: null,
    releaseId: "r1",
    ...values,
  }) as Task;

const done = new Set(["done"]);

function group(board: {
  columns: Array<{ tasks: Task[] }>;
  plannedTasks?: Task[];
  archivedTasks?: Task[];
}) {
  const full = { plannedTasks: [], archivedTasks: [], ...board };
  return groupReleaseItems(full, "r1", getFeatureIndex(full), done);
}

it("groups tasks under their feature, then the tasks without one", () => {
  const checkout = item("checkout", { type: "feature" });
  const pay = item("pay", { featureId: "checkout" });
  const loose = item("loose");
  const groups = group({
    columns: [{ tasks: [loose, checkout, pay] }],
  });

  expect(groups.features).toEqual([
    { feature: checkout, inRelease: true, tasks: [pay], tasksElsewhere: 0 },
  ]);
  expect(groups.standalone).toEqual([loose]);
});

it("shows a feature outside the release for its tasks in it, counting the rest", () => {
  const search = item("search", { type: "feature", releaseId: "r2" });
  const index = item("index", { featureId: "search" });
  const ranking = item("ranking", { featureId: "search", releaseId: "r2" });
  const old = item("old", {
    featureId: "search",
    releaseId: null,
    status: "archived",
  });
  const groups = group({
    columns: [{ tasks: [search, index, ranking] }],
    archivedTasks: [old],
  });

  expect(groups.features).toEqual([
    { feature: search, inRelease: false, tasks: [index], tasksElsewhere: 1 },
  ]);
});

it("puts unfinished first, in-release features first and done features last", () => {
  const shipped = item("shipped", { type: "feature", status: "done" });
  const other = item("other", { type: "feature", releaseId: "r2" });
  const live = item("live", { type: "feature" });
  const doneTask = item("done-task", { featureId: "live", status: "done" });
  const openTask = item("open-task", { featureId: "live" });
  const otherTask = item("other-task", { featureId: "other" });
  const looseDone = item("loose-done", { status: "done" });
  const loosePlanned = item("loose-planned", { status: "planned" });
  const groups = group({
    columns: [
      { tasks: [shipped, other, otherTask, openTask] },
      { tasks: [live, doneTask, looseDone] },
    ],
    plannedTasks: [loosePlanned],
  });

  expect(groups.features.map((entry) => entry.feature.id)).toEqual([
    "live",
    "other",
    "shipped",
  ]);
  expect(groups.features[0].tasks).toEqual([openTask, doneTask]);
  expect(groups.standalone).toEqual([loosePlanned, looseDone]);
});

it("leaves archived items out", () => {
  const groups = group({
    columns: [{ tasks: [] }],
    archivedTasks: [
      item("gone", { status: "archived" }),
      item("gone-feature", { type: "feature", status: "archived" }),
    ],
  });
  expect(groups).toEqual({ features: [], standalone: [] });
});
