import { describe, expect, it } from "vite-plus/test";
import {
  opensTaskOnDefaultView,
  validateProjectHomeSearch,
} from "./project-home-search";

describe("validateProjectHomeSearch", () => {
  it("defaults to Overview", () => {
    expect(validateProjectHomeSearch({})).toEqual({});
    expect(validateProjectHomeSearch({ tab: "overview" })).toEqual({});
    expect(validateProjectHomeSearch({ documentId: "d" })).toEqual({});
  });

  it("keeps an open page or Feature document on the Documents tab", () => {
    expect(
      validateProjectHomeSearch({ tab: "documents", documentId: "d" }),
    ).toEqual({ tab: "documents", documentId: "d" });
    expect(
      validateProjectHomeSearch({
        tab: "documents",
        documentId: "d",
        documentFeatureId: "f",
      }),
    ).toEqual({ tab: "documents", documentId: "d", documentFeatureId: "f" });
  });

  it("drops malformed ids and a Feature without a document", () => {
    expect(
      validateProjectHomeSearch({
        tab: "documents",
        documentId: "../x",
        documentFeatureId: "f",
      }),
    ).toEqual({ tab: "documents" });
  });
});

describe("opensTaskOnDefaultView", () => {
  it("recognizes links that opened a task before the home page", () => {
    expect(opensTaskOnDefaultView({ taskId: "t" })).toBe(true);
    expect(opensTaskOnDefaultView({ featureTab: "documents" })).toBe(true);
    expect(opensTaskOnDefaultView({})).toBe(false);
  });
});
