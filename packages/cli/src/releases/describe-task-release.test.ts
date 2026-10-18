import { describe, expect, it } from "vite-plus/test";
import { describeTaskRelease } from "./describe-task-release.js";

describe("describeTaskRelease", () => {
  it("names the release, or none", () => {
    expect(describeTaskRelease("2.4", 0)).toBe("release 2.4");
    expect(describeTaskRelease(null, 0)).toBe("no release");
  });

  it("counts the feature's tasks that moved with it", () => {
    expect(describeTaskRelease("2.4", 1)).toBe(
      "release 2.4, with 1 task of the feature",
    );
    expect(describeTaskRelease(null, 3)).toBe(
      "no release, with 3 tasks of the feature",
    );
  });
});
