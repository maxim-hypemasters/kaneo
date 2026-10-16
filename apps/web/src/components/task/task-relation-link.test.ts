import { describe, expect, it } from "vite-plus/test";
import {
  buildRelationLink,
  isTaskRelation,
  unpickableTaskIds,
} from "./task-relation-link";

const relations = [
  {
    sourceTaskId: "feature",
    targetTaskId: "task",
    relationType: "subtask",
  },
  {
    sourceTaskId: "task",
    targetTaskId: "related",
    relationType: "related",
  },
  {
    sourceTaskId: "blocker",
    targetTaskId: "task",
    relationType: "blocks",
  },
];

describe("buildRelationLink", () => {
  it("points blocking and related links from the open task", () => {
    expect(buildRelationLink("blocks", "task", "picked")).toEqual({
      sourceTaskId: "task",
      targetTaskId: "picked",
      relationType: "blocks",
    });
    expect(buildRelationLink("related", "task", "picked")).toEqual({
      sourceTaskId: "task",
      targetTaskId: "picked",
      relationType: "related",
    });
  });

  it("reverses blocked by links", () => {
    expect(buildRelationLink("blockedBy", "task", "picked")).toEqual({
      sourceTaskId: "picked",
      targetTaskId: "task",
      relationType: "blocks",
    });
  });
});

describe("isTaskRelation", () => {
  it("leaves out feature membership", () => {
    expect(relations.filter(isTaskRelation).map((r) => r.relationType)).toEqual(
      ["related", "blocks"],
    );
  });
});

describe("unpickableTaskIds", () => {
  it("hides the task and its related tasks, but not its feature", () => {
    expect([...unpickableTaskIds("task", relations)].sort()).toEqual([
      "blocker",
      "related",
      "task",
    ]);
  });
});
