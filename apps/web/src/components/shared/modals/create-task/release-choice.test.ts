import { describe, expect, it } from "vite-plus/test";
import {
  FOLLOW_MILESTONE_RELEASE,
  initialReleaseChoice,
  releaseRequest,
  sameReleaseChoice,
  shownRelease,
} from "./release-choice";
describe("Milestone release inheritance", () => {
  it("follows a selected milestone unless a release is preset", () => {
    expect(initialReleaseChoice(undefined)).toEqual({ kind: "follow" });
    expect(initialReleaseChoice("r")).toEqual({ kind: "set", id: "r" });
  });
  it("distinguishes inheritance from an explicit release or explicit none", () => {
    expect(
      sameReleaseChoice(FOLLOW_MILESTONE_RELEASE, { kind: "follow" }),
    ).toBe(true);
    expect(
      sameReleaseChoice(FOLLOW_MILESTONE_RELEASE, { kind: "set", id: null }),
    ).toBe(false);
    expect(
      sameReleaseChoice({ kind: "set", id: null }, { kind: "set", id: null }),
    ).toBe(true);
  });
  it("omits the release to inherit and preserves explicit overrides", () => {
    expect(releaseRequest(FOLLOW_MILESTONE_RELEASE)).toEqual({});
    expect(releaseRequest({ kind: "set", id: "r" })).toEqual({
      releaseId: "r",
    });
    expect(releaseRequest({ kind: "set", id: null })).toEqual({
      releaseId: null,
    });
  });
  it("shows the milestone release while following it", () => {
    expect(shownRelease(FOLLOW_MILESTONE_RELEASE, "r")).toEqual({
      id: "r",
      fromMilestone: true,
    });
    expect(shownRelease(FOLLOW_MILESTONE_RELEASE, null)).toEqual({
      id: null,
      fromMilestone: false,
    });
  });
  it("shows the explicit pick over a milestone's release", () => {
    expect(shownRelease({ kind: "set", id: "other" }, "r")).toEqual({
      id: "other",
      fromMilestone: false,
    });
    expect(shownRelease({ kind: "set", id: null }, "r")).toEqual({
      id: null,
      fromMilestone: false,
    });
  });
});
