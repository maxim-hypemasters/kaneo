import { describe, expect, it } from "vite-plus/test";
import { releaseItemsLabel } from "./release-items-label.js";

describe("releaseItemsLabel", () => {
  it.each([
    [3, 1, "3 tasks and 1 milestone"],
    [1, 0, "1 task"],
    [0, 2, "2 milestones"],
    [0, 0, "no tasks"],
  ])("labels %i tasks and %i milestones", (tasks, milestones, label) => {
    expect(releaseItemsLabel(tasks, milestones)).toBe(label);
  });
});
