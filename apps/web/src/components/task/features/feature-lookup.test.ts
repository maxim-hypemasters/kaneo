import { describe, expect, it } from "vite-plus/test";
import { getFeatureIndex } from "@/lib/features/feature-index";
import type Task from "@/types/task";
import {
  findTaskFeature,
  listFeatureTasks,
  pickableFeatures,
  type RelatedTaskSummary,
  type RelationWithTasks,
} from "./feature-lookup";

const task = (id: string, values: Partial<Task> = {}) =>
  ({
    id,
    title: id,
    number: 1,
    status: "to-do",
    projectId: "project",
    type: "task",
    featureId: null,
    ...values,
  }) as Task;

const summary = (
  id: string,
  values: Partial<RelatedTaskSummary> = {},
): RelatedTaskSummary => ({
  id,
  title: id,
  status: "to-do",
  isCompleted: false,
  priority: null,
  number: 7,
  projectId: "project",
  userId: null,
  assigneeName: null,
  ...values,
});

const featureLink = (
  feature: RelatedTaskSummary,
  member: RelatedTaskSummary,
): RelationWithTasks => ({
  relationType: "subtask",
  sourceTaskId: feature.id,
  targetTaskId: member.id,
  sourceTask: feature,
  targetTask: member,
});

const board = {
  columns: [
    {
      tasks: [
        task("checkout", { type: "feature", number: 3, title: "Checkout" }),
        task("cart", { featureId: "checkout" }),
        task("pay", { featureId: "checkout", status: "done" }),
      ],
    },
  ],
  plannedTasks: [task("search", { type: "feature" })],
};
const emptyIndex = getFeatureIndex(undefined);

describe("findTaskFeature", () => {
  it("reads the feature from the board", () => {
    expect(
      findTaskFeature({
        taskId: "cart",
        featureId: "checkout",
        projectId: "project",
        index: getFeatureIndex(board),
        relations: [],
        relationsLoaded: false,
      }),
    ).toEqual({
      id: "checkout",
      title: "Checkout",
      number: 3,
      projectId: "project",
    });
  });

  it("falls back to the task's feature link without a board", () => {
    const feature = summary("checkout", { title: "Checkout" });
    expect(
      findTaskFeature({
        taskId: "cart",
        featureId: "checkout",
        projectId: "project",
        index: emptyIndex,
        relations: [featureLink(feature, summary("cart"))],
        relationsLoaded: true,
      }),
    ).toEqual({
      id: "checkout",
      title: "Checkout",
      number: 7,
      projectId: "project",
    });
  });

  it("waits for the relations before calling a feature unknown", () => {
    const input = {
      taskId: "cart",
      featureId: "gone",
      projectId: "project",
      index: emptyIndex,
      relations: [],
    };
    expect(findTaskFeature({ ...input, relationsLoaded: false })).toBe(
      undefined,
    );
    expect(findTaskFeature({ ...input, relationsLoaded: true })).toEqual({
      id: "gone",
      title: null,
      number: null,
      projectId: "project",
    });
  });

  it("has no feature for a task outside one", () => {
    expect(
      findTaskFeature({
        taskId: "cart",
        featureId: null,
        projectId: "project",
        index: getFeatureIndex(board),
        relations: [],
        relationsLoaded: true,
      }),
    ).toBeNull();
  });
});

describe("listFeatureTasks", () => {
  it("lists the board's tasks with completion from final columns", () => {
    const tasks = listFeatureTasks({
      featureId: "checkout",
      index: getFeatureIndex(board),
      relations: [],
      finalStatuses: new Set(["done"]),
    });
    expect(
      tasks.map(({ task, isCompleted }) => [task.id, isCompleted]),
    ).toEqual([
      ["cart", false],
      ["pay", true],
    ]);
  });

  it("uses the feature links when the board lacks the feature", () => {
    const feature = summary("checkout");
    const tasks = listFeatureTasks({
      featureId: "checkout",
      index: emptyIndex,
      relations: [
        featureLink(feature, summary("cart", { isCompleted: true })),
        featureLink(summary("other"), summary("elsewhere")),
        {
          relationType: "related",
          sourceTaskId: "checkout",
          targetTaskId: "linked",
          sourceTask: feature,
          targetTask: summary("linked"),
        },
      ],
      finalStatuses: new Set(),
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      isCompleted: true,
      task: { id: "cart", featureId: "checkout", type: "task" },
    });
  });
});

describe("pickableFeatures", () => {
  it("leaves out the given features", () => {
    expect(
      pickableFeatures(getFeatureIndex(board), ["checkout", null]).map(
        (feature) => feature.id,
      ),
    ).toEqual(["search"]);
  });
});
