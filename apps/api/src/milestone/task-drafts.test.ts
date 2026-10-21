import { describe, expect, it } from "vite-plus/test";
import { createMilestoneBody } from "./schema";

describe("milestone creation drafts", () => {
  it("keeps existing callers compatible and trims/defaults title-only work", () => {
    expect(
      createMilestoneBody.parse({ title: "Milestone" }).newTasks,
    ).toBeUndefined();
    expect(
      createMilestoneBody.parse({
        title: "Milestone",
        newTasks: [{ title: " Task " }, { title: " Bug ", type: "bug" }],
      }).newTasks,
    ).toEqual([
      { title: "Task", type: "task" },
      { title: "Bug", type: "bug" },
    ]);
  });
  it("bounds the atomic batch and rejects blank or nonleaf work", () => {
    for (const newTasks of [
      [{ title: " " }],
      [{ title: "Feature", type: "feature" }],
      Array.from({ length: 101 }, () => ({ title: "Task" })),
    ])
      expect(
        createMilestoneBody.safeParse({ title: "Milestone", newTasks }).success,
      ).toBe(false);
    expect(
      createMilestoneBody.safeParse({
        title: "Milestone",
        newTasks: Array.from({ length: 100 }, () => ({ title: "Task" })),
      }).success,
    ).toBe(true);
  });
});
