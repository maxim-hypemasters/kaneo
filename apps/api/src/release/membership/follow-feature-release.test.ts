import { describe, expect, it } from "vite-plus/test";
import {
  releaseForJoiningTask,
  releaseForNewTask,
} from "./follow-feature-release";

describe("releaseForNewTask", () => {
  it("starts an omitted release in the feature's", () => {
    expect(releaseForNewTask(undefined, "2.4")).toBe("2.4");
  });

  it("starts in none without a feature, or in a feature with none", () => {
    expect(releaseForNewTask(undefined, null)).toBeNull();
  });

  it("lets an explicit release win over the feature's", () => {
    expect(releaseForNewTask("2.5", "2.4")).toBe("2.5");
    expect(releaseForNewTask("2.5", null)).toBe("2.5");
  });

  it("lets an explicit null keep the task out of the feature's release", () => {
    expect(releaseForNewTask(null, "2.4")).toBeNull();
  });
});

describe("releaseForJoiningTask", () => {
  it("gives a task without a release its feature's", () => {
    expect(releaseForJoiningTask(null, "2.4")).toBe("2.4");
  });

  it("keeps the release a task already has", () => {
    expect(releaseForJoiningTask("2.5", "2.4")).toBe("2.5");
    expect(releaseForJoiningTask("2.5", null)).toBe("2.5");
  });

  it("leaves a task in none when its feature has none", () => {
    expect(releaseForJoiningTask(null, null)).toBeNull();
  });
});
