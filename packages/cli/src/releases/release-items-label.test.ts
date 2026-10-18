import { describe, expect, it } from "vite-plus/test";
import { releaseItemsLabel } from "./release-items-label.js";

describe("releaseItemsLabel", () => {
  it.each([
    [3, 1, "3 tasks and 1 feature"],
    [1, 0, "1 task"],
    [0, 2, "2 features"],
    [0, 0, "no tasks"],
  ])("labels %i tasks and %i features", (tasks, features, label) => {
    expect(releaseItemsLabel(tasks, features)).toBe(label);
  });
});
