import { describe, expect, it } from "vite-plus/test";
import { planImportHierarchy } from "./plan-import-hierarchy";

const ids = new Map(
  ["f", "other", "parent", "child", "grandchild"].map((key) => [
    key,
    key.toUpperCase(),
  ]),
);
const edge = (
  sourceKey: string,
  targetKey: string,
  type: "subtask" | "related" = "subtask",
) => ({ sourceKey, targetKey, type });
describe("import hierarchy precedence", () => {
  it("keeps explicit null membership and Bug classification, retaining the old edge as Related", () => {
    const plan = planImportHierarchy(
      [
        { key: "parent", type: "bug", featureKey: null },
        { key: "child", type: "task", featureKey: null },
      ],
      ids,
      [edge("parent", "child")],
    );
    expect(plan.features).toEqual([]);
    expect([...plan.memberships]).toEqual([]);
    expect(plan.relations).toEqual([
      {
        sourceTaskId: "PARENT",
        targetTaskId: "CHILD",
        relationType: "related",
      },
    ]);
  });
  it("honors an explicit different Feature and drops only matching synthetic edges", () => {
    const plan = planImportHierarchy(
      [
        { key: "f", type: "feature" },
        { key: "parent", type: "bug", featureKey: null },
        { key: "child", type: "bug", featureKey: "f" },
      ],
      ids,
      [edge("parent", "child"), edge("f", "child")],
    );
    expect(plan.features).toEqual([]);
    expect([...plan.memberships]).toEqual([]);
    expect(plan.relations).toEqual([
      {
        sourceTaskId: "PARENT",
        targetTaskId: "CHILD",
        relationType: "related",
      },
    ]);
  });
  it("uses explicit membership while flattening omitted descendants", () => {
    const plan = planImportHierarchy(
      [
        { key: "f", type: "feature" },
        { key: "parent", type: "bug", featureKey: "f" },
        { key: "child", type: "task" },
      ],
      ids,
      [edge("parent", "child")],
    );
    expect(plan.features).toEqual([]);
    expect([...plan.memberships]).toEqual([["CHILD", "F"]]);
    expect(plan.relations).toEqual([
      {
        sourceTaskId: "PARENT",
        targetTaskId: "CHILD",
        relationType: "related",
      },
    ]);
  });
  it("retains old-provider promotion and flattening when membership fields are omitted", () => {
    const plan = planImportHierarchy(
      [{ key: "parent" }, { key: "child" }, { key: "grandchild" }],
      ids,
      [edge("parent", "child"), edge("child", "grandchild")],
    );
    expect(plan.features).toEqual(["PARENT"]);
    expect(Object.fromEntries(plan.memberships)).toEqual({
      CHILD: "PARENT",
      GRANDCHILD: "PARENT",
    });
    expect(plan.relations).toEqual([
      {
        sourceTaskId: "CHILD",
        targetTaskId: "GRANDCHILD",
        relationType: "related",
      },
    ]);
  });
  it("deduplicates conflicting legacy edges against existing Related links", () => {
    const plan = planImportHierarchy(
      [
        { key: "parent", type: "bug", featureKey: null },
        { key: "child", featureKey: null },
      ],
      ids,
      [edge("parent", "child"), edge("child", "parent", "related")],
    );
    expect(plan.relations).toHaveLength(1);
    expect(plan.relations[0]?.relationType).toBe("related");
  });
  it("rejects invalid explicit owners rather than promoting them through old edges", () => {
    expect(() =>
      planImportHierarchy(
        [
          { key: "parent", type: "bug" },
          { key: "child", featureKey: "parent" },
        ],
        ids,
        [edge("parent", "child")],
      ),
    ).toThrow();
  });
});
