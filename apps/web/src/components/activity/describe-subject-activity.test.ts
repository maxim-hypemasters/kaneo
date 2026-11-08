import { describe, expect, it } from "vite-plus/test";
import {
  activitySubjectOf,
  describeSubjectActivity,
} from "./describe-subject-activity";

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

describe("activitySubjectOf", () => {
  it("words Features as features and Bugs as tasks", () => {
    expect(activitySubjectOf("feature")).toBe("feature");
    expect(activitySubjectOf("bug")).toBe("task");
    expect(activitySubjectOf(undefined)).toBe("task");
  });
});

describe("describeSubjectActivity", () => {
  it.each(["create", "created", "task"])(
    "describes %s for each subject",
    (type) => {
      expect(describeSubjectActivity(type, null, "task", t)).toBe(
        "activity:created",
      );
      expect(describeSubjectActivity(type, null, "feature", t)).toBe(
        "activity:createdFeature",
      );
    },
  );

  it("describes moves for each subject", () => {
    const between = { fromProjectName: "Web", toProjectName: "Mobile" };
    expect(describeSubjectActivity("moved", between, "task", t)).toBe(
      'activity:moved {"from":"Web","to":"Mobile"}',
    );
    expect(describeSubjectActivity("moved", between, "feature", t)).toBe(
      'activity:movedFeature {"from":"Web","to":"Mobile"}',
    );
    const hidden = { fromProjectName: null, toProjectName: "Mobile" };
    expect(describeSubjectActivity("moved", hidden, "task", t)).toBe(
      'activity:movedFromOtherProject {"to":"Mobile"}',
    );
    expect(describeSubjectActivity("moved", hidden, "feature", t)).toBe(
      'activity:movedFeatureFromOtherProject {"to":"Mobile"}',
    );
  });

  it("describes a posted Feature update", () => {
    expect(describeSubjectActivity("feature_update", {}, "feature", t)).toBe(
      "activity:postedFeatureUpdate",
    );
  });

  it("leaves other events and moves without event data alone", () => {
    expect(describeSubjectActivity("moved", null, "task", t)).toBeNull();
    expect(describeSubjectActivity("status_changed", {}, "task", t)).toBeNull();
  });
});
