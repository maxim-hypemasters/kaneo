import { describe, expect, it } from "vite-plus/test";
import { describeHierarchyActivity } from "./describe-hierarchy-activity";

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

describe("describeHierarchyActivity", () => {
  it("describes joining, leaving and switching features", () => {
    expect(
      describeHierarchyActivity(
        "feature_changed",
        { oldFeatureId: null, newFeatureId: "f1", newFeatureTitle: "Checkout" },
        t,
      ),
    ).toBe('activity:addedToFeature {"feature":"Checkout"}');
    expect(
      describeHierarchyActivity(
        "feature_changed",
        { oldFeatureId: "f1", oldFeatureTitle: "Checkout", newFeatureId: null },
        t,
      ),
    ).toBe('activity:removedFromFeature {"feature":"Checkout"}');
    expect(
      describeHierarchyActivity(
        "feature_changed",
        {
          oldFeatureId: "f1",
          oldFeatureTitle: "Checkout",
          newFeatureId: "f2",
          newFeatureTitle: "Payments",
        },
        t,
      ),
    ).toBe('activity:changedFeature {"from":"Checkout","to":"Payments"}');
  });

  it("names a deleted feature as unknown", () => {
    expect(
      describeHierarchyActivity(
        "feature_changed",
        { oldFeatureId: "gone", oldFeatureTitle: null, newFeatureId: null },
        t,
      ),
    ).toBe('activity:removedFromFeature {"feature":"tasks:features.unknown"}');
  });

  it("describes type changes", () => {
    expect(
      describeHierarchyActivity("type_changed", { newType: "feature" }, t),
    ).toBe("activity:madeFeature");
    expect(
      describeHierarchyActivity("type_changed", { newType: "task" }, t),
    ).toBe("activity:madeTask");
  });

  it("leaves other events and missing data to the caller", () => {
    expect(describeHierarchyActivity("status_changed", {}, t)).toBeNull();
    expect(describeHierarchyActivity("feature_changed", null, t)).toBeNull();
  });
});
