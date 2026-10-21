import { describe, expect, it } from "vite-plus/test";
import {
  getTaskReleaseOrigin,
  resolveOriginRelease,
  taskReleaseSearch,
  validateTaskReleaseSearch,
} from "./task-release-origin";

describe("task release origin", () => {
  it("accepts a portable release ID and ignores malformed URL values", () => {
    expect(
      validateTaskReleaseSearch({ originReleaseId: "r-123_test" }),
    ).toEqual({
      originReleaseId: "r-123_test",
    });
    for (const originReleaseId of [
      undefined,
      null,
      [],
      "",
      "bad id",
      "a".repeat(256),
    ]) {
      expect(
        validateTaskReleaseSearch({ originReleaseId }).originReleaseId,
      ).toBeUndefined();
    }
  });

  it("preserves same-project navigation and drops foreign or independent context", () => {
    const origin = getTaskReleaseOrigin("p", "p", "release");
    expect(taskReleaseSearch(origin, "p")).toEqual({
      originReleaseId: "release",
    });
    expect(taskReleaseSearch(origin, "another-project")).toEqual({});
    expect(getTaskReleaseOrigin("p", "another-project", "release")).toBeNull();
    expect(getTaskReleaseOrigin("p", undefined, "release")).toBeNull();
    expect(getTaskReleaseOrigin("p", "p", undefined)).toBeNull();
  });

  it("reconstructs context from URL on reload, back, and forward without sticky memory", () => {
    const searches = [
      { originReleaseId: "a" },
      { originReleaseId: "b" },
      {},
      { originReleaseId: "b" },
    ];
    expect(
      searches.map((search) => {
        const { originReleaseId } = validateTaskReleaseSearch(search);
        return taskReleaseSearch(
          getTaskReleaseOrigin("p", "p", originReleaseId),
          "p",
        );
      }),
    ).toEqual([
      { originReleaseId: "a" },
      { originReleaseId: "b" },
      {},
      { originReleaseId: "b" },
    ]);
  });

  it("resolves only accessible releases in the Feature's actual project", () => {
    const releases = [{ id: "release", projectId: "p" }];
    expect(resolveOriginRelease("release", "p", releases)).toBe("release");
    expect(resolveOriginRelease("release", "other", releases)).toBeNull();
    expect(resolveOriginRelease("deleted", "p", releases)).toBeNull();
    expect(resolveOriginRelease(undefined, "p", releases)).toBeNull();
  });
});
