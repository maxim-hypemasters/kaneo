import { describe, expect, it } from "vite-plus/test";
import { matchRelease } from "./match-release.js";
import { releaseFixture } from "./test-releases.js";

const releases = [
  releaseFixture("r1", "2.4"),
  releaseFixture("r2", "Beta"),
  releaseFixture("r3", "beta"),
  releaseFixture("r4", "Winter Launch"),
];

describe("matchRelease", () => {
  it("finds a release by id", () => {
    expect(matchRelease(releases, " r2 ")).toEqual({
      kind: "found",
      release: releases[1],
    });
  });

  it("finds a release by its exact name", () => {
    expect(matchRelease(releases, "beta")).toEqual({
      kind: "found",
      release: releases[2],
    });
  });

  it("finds a release by a name in another case", () => {
    expect(matchRelease(releases, "winter launch")).toEqual({
      kind: "found",
      release: releases[3],
    });
  });

  it("reports names that differ only in case", () => {
    expect(matchRelease(releases, "BETA")).toEqual({
      kind: "ambiguous",
      candidates: [releases[1], releases[2]],
    });
  });

  it("reports no match", () => {
    expect(matchRelease(releases, "2.5")).toEqual({ kind: "none" });
  });
});
