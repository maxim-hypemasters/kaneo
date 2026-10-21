import { describe, expect, it } from "vite-plus/test";
import { featureCompositionSchema } from "./feature-composition-schema";
import { createTaskBody } from "./schema";

describe("Feature creation composition", () => {
  it("keeps ordinary callers compatible and defaults trimmed Task drafts", () => {
    expect(
      createTaskBody.parse({ title: "Ordinary", description: "" })
        .featureComposition,
    ).toBeUndefined();
    expect(
      featureCompositionSchema.parse({
        milestones: [{ key: "m", title: " Milestone " }],
        newTasks: [
          { title: " Work ", milestoneKey: "m" },
          { title: "Bug", type: "bug" },
        ],
      }),
    ).toMatchObject({
      milestones: [{ key: "m", title: "Milestone" }],
      newTasks: [
        { title: "Work", type: "task", milestoneKey: "m" },
        { title: "Bug", type: "bug" },
      ],
    });
  });
  it.each([
    { milestones: [{ key: "m", title: " " }] },
    {
      milestones: [
        { key: "m", title: "One" },
        { key: "m", title: "Two" },
      ],
    },
    { existingTasks: [{ id: "t" }, { id: "t" }] },
    { existingTasks: [{ id: "t", milestoneKey: "unknown" }] },
    { newTasks: [{ title: "New", milestoneKey: "unknown" }] },
    { newTasks: [{ title: " " }] },
    { newTasks: [{ title: "Feature", type: "feature" }] },
    { milestones: [{ key: "m", title: "Manual", status: "done" }] },
    { milestones: [{ key: "m", title: "Manual", startDate: null }] },
    { newTasks: [{ title: "Extra", releaseId: "r" }] },
  ])("rejects malformed or ambiguous hierarchy %j", (input) => {
    expect(featureCompositionSchema.safeParse(input).success).toBe(false);
  });
  it.each(["milestones", "existingTasks", "newTasks"] as const)(
    "bounds %s at 100",
    (field) => {
      const item = (index: number) =>
        field === "milestones"
          ? { key: `m${index}`, title: "Milestone" }
          : field === "existingTasks"
            ? { id: `t${index}` }
            : { title: "Task" };
      expect(
        featureCompositionSchema.safeParse({
          [field]: Array.from({ length: 100 }, (_, index) => item(index)),
        }).success,
      ).toBe(true);
      expect(
        featureCompositionSchema.safeParse({
          [field]: Array.from({ length: 101 }, (_, index) => item(index)),
        }).success,
      ).toBe(false);
    },
  );
  it.each([undefined, "task", "bug"])(
    "rejects composition for leaf type %s",
    (type) => {
      expect(
        createTaskBody.safeParse({
          title: "Leaf",
          description: "",
          type,
          featureComposition: {},
        }).success,
      ).toBe(false);
    },
  );
  it("accepts a Feature without milestones", () => {
    expect(
      createTaskBody.safeParse({
        title: "Feature",
        description: "",
        type: "feature",
        featureComposition: {
          newTasks: [{ title: "Direct work", milestoneKey: null }],
        },
      }).success,
    ).toBe(true);
  });
});
