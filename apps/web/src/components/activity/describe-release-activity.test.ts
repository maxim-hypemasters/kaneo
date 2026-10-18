import { describe, expect, it } from "vite-plus/test";
import { describeReleaseActivity } from "./describe-release-activity";

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

describe("describeReleaseActivity", () => {
  it("describes joining, leaving and switching releases", () => {
    expect(
      describeReleaseActivity(
        "release_changed",
        { oldReleaseId: null, newReleaseId: "r24", newReleaseName: "2.4" },
        t,
      ),
    ).toBe('activity:addedToRelease {"release":"2.4"}');
    expect(
      describeReleaseActivity(
        "release_changed",
        { oldReleaseId: "r24", oldReleaseName: "2.4", newReleaseId: null },
        t,
      ),
    ).toBe('activity:removedFromRelease {"release":"2.4"}');
    expect(
      describeReleaseActivity(
        "release_changed",
        {
          oldReleaseId: "r24",
          oldReleaseName: "2.4",
          newReleaseId: "r25",
          newReleaseName: "2.5",
        },
        t,
      ),
    ).toBe('activity:changedRelease {"from":"2.4","to":"2.5"}');
  });

  it("names a release it can't name as unknown", () => {
    expect(
      describeReleaseActivity(
        "release_changed",
        {
          oldReleaseId: "r24",
          oldReleaseName: null,
          newReleaseId: "r25",
          newReleaseName: null,
        },
        t,
      ),
    ).toBe(
      'activity:changedRelease {"from":"tasks:releases.unknown","to":"tasks:releases.unknown"}',
    );
  });

  it("leaves other events and missing data to the caller", () => {
    expect(describeReleaseActivity("feature_changed", {}, t)).toBeNull();
    expect(describeReleaseActivity("release_changed", null, t)).toBeNull();
    expect(
      describeReleaseActivity(
        "release_changed",
        { oldReleaseId: null, newReleaseId: null },
        t,
      ),
    ).toBeNull();
  });
});
