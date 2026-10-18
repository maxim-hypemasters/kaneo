import { describe, expect, it } from "vite-plus/test";
import {
  redactReleaseChange,
  releaseChangeProjectIds,
} from "./redact-release-change";

const change = {
  projectId: "alpha",
  oldReleaseId: "r1",
  oldReleaseName: "2.4",
  newReleaseId: "r2",
  newReleaseName: "2.5",
};

describe("releaseChangeProjectIds", () => {
  it("names the project the event stored", () => {
    expect(releaseChangeProjectIds(change)).toEqual(["alpha"]);
  });

  it("names none when the event has no project", () => {
    expect(releaseChangeProjectIds({ ...change, projectId: null })).toEqual([]);
  });
});

describe("redactReleaseChange", () => {
  it("returns the data itself when the viewer sees the project", () => {
    expect(redactReleaseChange(change, () => true)).toBe(change);
  });

  it("hides the names and the project the viewer can't see, keeping the ids", () => {
    expect(redactReleaseChange(change, (id) => id === "beta")).toEqual({
      projectId: null,
      oldReleaseId: "r1",
      oldReleaseName: null,
      newReleaseId: "r2",
      newReleaseName: null,
    });
  });

  it("hides names whose project can't be told", () => {
    const unplaced = {
      oldReleaseId: "r1",
      oldReleaseName: "2.4",
      newReleaseId: "r2",
      newReleaseName: "2.5",
    };
    expect(redactReleaseChange(unplaced, () => true)).toEqual({
      oldReleaseId: "r1",
      oldReleaseName: null,
      newReleaseId: "r2",
      newReleaseName: null,
    });
  });

  it("returns the data itself when there is nothing to hide", () => {
    const unnamed = {
      oldReleaseId: null,
      oldReleaseName: null,
      newReleaseId: "r2",
      newReleaseName: null,
    };
    expect(redactReleaseChange(unnamed, () => false)).toBe(unnamed);
  });
});
