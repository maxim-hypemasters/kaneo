import { describe, expect, it } from "vite-plus/test";
import { planImportFeatures } from "./plan-import-features";

const link = (
  sourceTaskId: string,
  targetTaskId: string,
  relationType: "subtask" | "blocks" | "related" = "subtask",
) => ({ sourceTaskId, targetTaskId, relationType });

describe("planImportFeatures", () => {
  it("turns an imported tree into one feature and its tasks", () => {
    const plan = planImportFeatures(
      [
        link("epic", "story"),
        link("story", "sub"),
        link("story", "x", "blocks"),
      ],
      ["epic", "story", "sub", "x"],
    );

    expect(plan.features).toEqual(["epic"]);
    expect(Object.fromEntries(plan.memberships)).toEqual({
      story: "epic",
      sub: "epic",
    });
    expect(plan.relations).toEqual([
      link("story", "x", "blocks"),
      link("story", "sub", "related"),
    ]);
  });

  it("keeps a second parent as a related link, once", () => {
    const plan = planImportFeatures(
      [
        link("p1", "c"),
        link("p2", "c"),
        link("old", "new"),
        link("old", "new", "related"),
      ],
      ["p1", "p2", "c", "old", "new"],
    );

    expect(plan.features.sort()).toEqual(["old", "p1"]);
    expect(plan.relations).toEqual([
      link("old", "new", "related"),
      link("p2", "c", "related"),
    ]);
  });
});
