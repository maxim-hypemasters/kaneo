import { describe, expect, it } from "vite-plus/test";
import { validateFeatureWorkspaceSearch } from "./feature-workspace-search";

describe("Feature workspace URL state", () => {
  it("defaults invalid or missing tabs to Overview without retaining content IDs", () => {
    for (const featureTab of [undefined, "settings", ["documents"], 1]) {
      expect(
        validateFeatureWorkspaceSearch({
          featureTab,
          featureDocumentId: "doc",
        }),
      ).toEqual({});
    }
  });
  it("accepts each tab and keeps content scoped to its corresponding tab", () => {
    expect(
      validateFeatureWorkspaceSearch({
        featureTab: "documents",
        featureDocumentId: "doc-1",
        featureUpdateId: "report",
      }),
    ).toEqual({ featureTab: "documents", featureDocumentId: "doc-1" });
    expect(
      validateFeatureWorkspaceSearch({
        featureTab: "activity",
        featureUpdateId: "report_2",
        featureDocumentId: "doc",
      }),
    ).toEqual({ featureTab: "activity", featureUpdateId: "report_2" });
    expect(
      validateFeatureWorkspaceSearch({
        featureTab: "issues",
        featureDocumentId: "doc",
      }),
    ).toEqual({ featureTab: "issues" });
    expect(validateFeatureWorkspaceSearch({ featureTab: "overview" })).toEqual({
      featureTab: "overview",
    });
  });
  it("rejects malformed, repeated, and overlong document IDs", () => {
    for (const featureDocumentId of [
      "",
      "../other",
      ["doc"],
      "d".repeat(256),
    ]) {
      expect(
        validateFeatureWorkspaceSearch({
          featureTab: "documents",
          featureDocumentId,
        }),
      ).toEqual({ featureTab: "documents" });
    }
  });
});
