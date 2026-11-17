import { describe, expect, it } from "vite-plus/test";
import type { AssistantNestedTask } from "../message-types";
import { type NestedLabel, nestedPreview } from "./nested-preview";

const LABELS: Record<string, string> = {
  "taskId:t1": "KAN-1 Old login",
  "taskId:t2": "KAN-2 Old signup",
  "leadId:u1": "Ada",
  "releaseId:r1": "2.0",
  "releaseId:r2": "2.1",
};
const label: NestedLabel = async (key, id) => LABELS[`${key}:${id}`] ?? id;

const draft = (
  title: string,
  extra: Partial<AssistantNestedTask> = {},
): AssistantNestedTask => ({
  title,
  type: null,
  estimateSeconds: null,
  existing: false,
  ...extra,
});
const linked = (title: string): AssistantNestedTask => ({
  title,
  type: null,
  estimateSeconds: null,
  existing: true,
});

const composition = {
  milestones: [
    {
      key: "m1",
      title: "Design",
      leadId: "u1",
      priority: "high",
      releaseId: "r1",
    },
    { key: "m2", title: "Build", leadId: null },
  ],
  newTasks: [
    {
      title: "Sketch screens",
      milestoneKey: "m1",
      type: "task",
      estimateSeconds: 5400,
    },
    { title: "Write API", milestoneKey: "m2", type: "bug" },
    { title: "Loose end" },
    { title: "Unplaced", milestoneKey: null },
  ],
  existingTasks: [{ id: "t1", milestoneKey: "m2" }, { id: "t2" }],
  unassignedReleaseId: "r2",
};

describe("nestedPreview", () => {
  it("shows everything a new Feature writes for its milestones and work", async () => {
    expect(
      await nestedPreview(
        "create_task",
        { type: "feature", featureComposition: composition },
        label,
      ),
    ).toEqual({
      milestones: [
        {
          title: "Design",
          leadLabel: "Ada",
          releaseLabel: "2.0",
          priority: "high",
          tasks: [
            draft("Sketch screens", { type: "task", estimateSeconds: 5400 }),
          ],
        },
        {
          title: "Build",
          leadLabel: null,
          releaseLabel: null,
          priority: null,
          tasks: [
            draft("Write API", { type: "bug" }),
            linked("KAN-1 Old login"),
          ],
        },
      ],
      tasks: [
        draft("Loose end"),
        draft("Unplaced"),
        linked("KAN-2 Old signup"),
      ],
      unassignedReleaseLabel: "2.1",
    });
  });

  it("falls back to the id for linked work without a label", async () => {
    expect(
      await nestedPreview(
        "create_task",
        { featureComposition: { existingTasks: [{ id: "t9" }] } },
        label,
      ),
    ).toEqual({
      milestones: [],
      tasks: [linked("t9")],
      unassignedReleaseLabel: null,
    });
  });

  it("shows a new milestone's task drafts, leaving planning to the fields", async () => {
    expect(
      await nestedPreview(
        "create_milestone",
        {
          title: "Beta",
          leadId: "u1",
          releaseId: "r1",
          priority: "low",
          newTasks: [{ title: "One", estimateSeconds: 600 }, { title: "Two" }],
        },
        label,
      ),
    ).toEqual({
      milestones: [
        {
          title: "Beta",
          leadLabel: null,
          releaseLabel: null,
          priority: null,
          tasks: [draft("One", { estimateSeconds: 600 }), draft("Two")],
        },
      ],
      tasks: [],
      unassignedReleaseLabel: null,
    });
  });

  it("is null without nested work", async () => {
    expect(
      await nestedPreview("create_task", { title: "x" }, label),
    ).toBeNull();
    expect(
      await nestedPreview(
        "create_task",
        { featureComposition: { unassignedReleaseId: "r1" } },
        label,
      ),
    ).toBeNull();
    expect(
      await nestedPreview("create_milestone", { title: "x" }, label),
    ).toBeNull();
    expect(
      await nestedPreview("update_task", { title: "x" }, label),
    ).toBeNull();
  });
});
