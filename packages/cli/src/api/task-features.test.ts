import { describe, expect, it } from "vite-plus/test";
import { taskTypeOf } from "./task-features.js";

describe("taskTypeOf", () => {
  it("reads a feature", () => {
    expect(taskTypeOf({ type: "feature" })).toBe("feature");
  });
  it("preserves bugs", () => {
    expect(taskTypeOf({ type: "bug" })).toBe("bug");
  });

  it("treats a missing or unknown type as a task", () => {
    expect(taskTypeOf({ type: "task" })).toBe("task");
    expect(taskTypeOf({})).toBe("task");
    expect(taskTypeOf({ type: "epic" })).toBe("task");
  });
});
