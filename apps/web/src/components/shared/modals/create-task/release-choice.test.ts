import { describe, expect, it } from "vite-plus/test";
import { getFeatureIndex } from "@/lib/features/feature-index";
import type Task from "@/types/task";
import {
  FOLLOW_FEATURE_RELEASE,
  featureReleaseOf,
  initialReleaseChoice,
  releaseRequest,
  sameReleaseChoice,
  shownRelease,
} from "./release-choice";

const index = getFeatureIndex({
  columns: [
    {
      tasks: [
        { id: "checkout", type: "feature", releaseId: "r24" },
        { id: "search", type: "feature", releaseId: null },
      ] as Task[],
    },
  ],
});

describe("initialReleaseChoice", () => {
  it("follows the feature unless a release is preset", () => {
    expect(initialReleaseChoice(undefined)).toEqual({ kind: "follow" });
    expect(initialReleaseChoice("r24")).toEqual({ kind: "set", id: "r24" });
  });
});

describe("sameReleaseChoice", () => {
  it("tells following from a pick, and picks apart", () => {
    const none = { kind: "set", id: null } as const;
    expect(sameReleaseChoice(FOLLOW_FEATURE_RELEASE, { kind: "follow" })).toBe(
      true,
    );
    expect(sameReleaseChoice(FOLLOW_FEATURE_RELEASE, none)).toBe(false);
    expect(sameReleaseChoice(none, { kind: "set", id: null })).toBe(true);
    expect(sameReleaseChoice(none, { kind: "set", id: "r24" })).toBe(false);
  });
});

describe("releaseRequest", () => {
  it("leaves the release out to follow the feature, and sends a pick, null too", () => {
    expect(releaseRequest(FOLLOW_FEATURE_RELEASE)).toEqual({});
    expect(releaseRequest({ kind: "set", id: "r24" })).toEqual({
      releaseId: "r24",
    });
    expect(releaseRequest({ kind: "set", id: null })).toEqual({
      releaseId: null,
    });
  });
});

describe("featureReleaseOf", () => {
  it("reads the cached board over the feature list's snapshot", () => {
    // The feature moved to another release after it was picked.
    expect(
      featureReleaseOf(
        {
          kind: "existing",
          id: "checkout",
          title: "Checkout",
          releaseId: null,
        },
        index,
      ),
    ).toBe("r24");
    expect(
      featureReleaseOf(
        { kind: "existing", id: "search", title: "Search", releaseId: "r25" },
        index,
      ),
    ).toBeNull();
  });

  it("falls back to the feature list without the feature on the board", () => {
    expect(
      featureReleaseOf(
        { kind: "existing", id: "gone", title: "Gone", releaseId: "r26" },
        index,
      ),
    ).toBe("r26");
    expect(
      featureReleaseOf(
        { kind: "existing", id: "gone", title: "Gone", releaseId: "r26" },
        getFeatureIndex(undefined),
      ),
    ).toBe("r26");
    expect(
      featureReleaseOf({ kind: "existing", id: "gone", title: "Gone" }, index),
    ).toBeNull();
  });

  it("gives none for no feature or one still to create", () => {
    expect(featureReleaseOf(null, index)).toBeNull();
    expect(featureReleaseOf({ kind: "new", title: "Payments" }, index)).toBe(
      null,
    );
  });
});

describe("shownRelease", () => {
  it("shows the feature's release while following it", () => {
    expect(shownRelease(FOLLOW_FEATURE_RELEASE, "r24")).toEqual({
      id: "r24",
      fromFeature: true,
    });
    expect(shownRelease(FOLLOW_FEATURE_RELEASE, null)).toEqual({
      id: null,
      fromFeature: false,
    });
  });

  it("shows a pick over the feature's release", () => {
    expect(shownRelease({ kind: "set", id: "r25" }, "r24")).toEqual({
      id: "r25",
      fromFeature: false,
    });
    expect(shownRelease({ kind: "set", id: null }, "r24")).toEqual({
      id: null,
      fromFeature: false,
    });
  });
});
