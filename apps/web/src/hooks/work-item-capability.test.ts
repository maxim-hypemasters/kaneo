import { describe, expect, it } from "vite-plus/test";
import { workItemCapability } from "./work-item-capability";

describe("workItemCapability", () => {
  it("maps each task row type to its own capability", () => {
    expect(workItemCapability("task", "update")).toBe("updateTasks");
    expect(workItemCapability("bug", "create")).toBe("createBugs");
    expect(workItemCapability("feature", "delete")).toBe("deleteFeatures");
  });

  it("treats rows without a known type as tasks", () => {
    expect(workItemCapability(undefined, "update")).toBe("updateTasks");
    expect(workItemCapability("other", "delete")).toBe("deleteTasks");
  });
});
