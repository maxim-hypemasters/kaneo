import { describe, expect, it } from "vite-plus/test";
import {
  featureChangeProjects,
  redactFeatureChange,
} from "./redact-feature-change";

// Events written before feature_changed stored a project.
const legacy = {
  oldFeatureId: "checkout",
  oldFeatureTitle: "Checkout",
  newFeatureId: "contoso",
  newFeatureTitle: "Acquire Contoso",
};
const change = { projectId: "alpha", ...legacy };
const none = new Map<string, string>();

describe("featureChangeProjects", () => {
  it("uses the project the event stored for both features", () => {
    expect(featureChangeProjects(change, "task", none)).toEqual({
      old: "alpha",
      new: "alpha",
    });
  });

  it("places an older event's feature in the task's project while it still is", () => {
    const current = new Map([
      ["task", "beta"],
      ["checkout", "alpha"],
      ["contoso", "beta"],
    ]);
    expect(featureChangeProjects(legacy, "task", current)).toEqual({
      old: null,
      new: "beta",
    });
  });

  it("can't place an older event's deleted feature", () => {
    expect(
      featureChangeProjects(legacy, "task", new Map([["task", "alpha"]])),
    ).toEqual({ old: null, new: null });
  });
});

describe("redactFeatureChange", () => {
  it("hides titles and the project the viewer can't see, keeping the ids", () => {
    expect(
      redactFeatureChange(change, { old: "alpha", new: "alpha" }, () => false),
    ).toEqual({
      projectId: null,
      oldFeatureId: "checkout",
      oldFeatureTitle: null,
      newFeatureId: "contoso",
      newFeatureTitle: null,
    });
  });

  it("hides a title whose project can't be told", () => {
    expect(
      redactFeatureChange(legacy, { old: null, new: "beta" }, () => true),
    ).toEqual({ ...legacy, oldFeatureTitle: null });
  });

  it("returns the data itself when everything is visible", () => {
    expect(
      redactFeatureChange(change, { old: "alpha", new: "alpha" }, () => true),
    ).toBe(change);
  });
});
