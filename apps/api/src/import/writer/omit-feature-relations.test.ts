import { describe, expect, it } from "vite-plus/test";
import { omitFeatureRelations } from "./omit-feature-relations";
import type { PlannedImportRelation } from "./plan-import-relations";

const link = (
  sourceTaskId: string,
  targetTaskId: string,
  relationType: PlannedImportRelation["relationType"] = "blocks",
): PlannedImportRelation => ({ sourceTaskId, targetTaskId, relationType });

const features = new Set(["feature"]);

describe("omitFeatureRelations", () => {
  it("keeps links between Tasks and Bugs without a warning", () => {
    const relations = [link("a", "b"), link("b", "c", "related")];
    expect(omitFeatureRelations(relations, features)).toEqual({
      relations,
      warnings: [],
    });
  });

  it("drops a link with a Feature on either end and says so once", () => {
    expect(
      omitFeatureRelations(
        [link("feature", "a"), link("a", "b"), link("b", "feature", "related")],
        features,
      ),
    ).toEqual({
      relations: [link("a", "b")],
      warnings: [
        "2 task links to features were not copied: features don't have relations.",
      ],
    });
  });

  it("words a single dropped link in the singular", () => {
    expect(
      omitFeatureRelations([link("a", "feature")], features).warnings,
    ).toEqual([
      "1 task link to a feature was not copied: features don't have relations.",
    ]);
  });
});
