import { describe, expect, it } from "vite-plus/test";
import { findTaskRelease } from "./task-release-lookup";

const releases = [
  { id: "r24", name: "2.4" },
  { id: "r25", name: "2.5" },
];

describe("findTaskRelease", () => {
  it("finds the task's release in the project's releases", () => {
    expect(
      findTaskRelease({ releaseId: "r25", releases, failed: false }),
    ).toEqual({ id: "r25", name: "2.5" });
  });

  it("says when the task has no release, even before the list loads", () => {
    expect(
      findTaskRelease({ releaseId: null, releases: undefined, failed: false }),
    ).toBeNull();
  });

  it("waits for the list, and for a task that hasn't loaded", () => {
    expect(
      findTaskRelease({ releaseId: "r24", releases: undefined, failed: false }),
    ).toBeUndefined();
    expect(
      findTaskRelease({ releaseId: undefined, releases, failed: false }),
    ).toBeUndefined();
  });

  it("calls a release the list lacks, or can't load, unknown", () => {
    expect(
      findTaskRelease({ releaseId: "gone", releases, failed: false }),
    ).toBe("unknown");
    expect(
      findTaskRelease({ releaseId: "r24", releases: undefined, failed: true }),
    ).toBe("unknown");
  });
});
