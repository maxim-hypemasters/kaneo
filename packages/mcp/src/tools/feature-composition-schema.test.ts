import { describe, expect, it } from "vite-plus/test";
import { featureCompositionSchema } from "./feature-composition-schema.js";

describe("featureCompositionSchema", () => {
  it("accepts milestones with existing work and drafts placed in them", () => {
    const composition = {
      milestones: [{ key: "m1", title: " Beta ", priority: "high" }],
      existingTasks: [{ id: "t-9", milestoneKey: "m1" }],
      newTasks: [
        { title: "Write docs", type: "bug", milestoneKey: "m1" },
        { title: "Ship it", milestoneKey: null },
      ],
      unassignedReleaseId: null,
    };
    expect(featureCompositionSchema.parse(composition)).toEqual({
      ...composition,
      milestones: [{ key: "m1", title: "Beta", priority: "high" }],
    });
  });

  it.each([
    [
      "duplicate milestone keys",
      {
        milestones: [
          { key: "m", title: "A" },
          { key: "m", title: "B" },
        ],
      },
      ["milestones", 1, "key"],
    ],
    [
      "duplicate existing work",
      { existingTasks: [{ id: "t" }, { id: "t" }] },
      ["existingTasks", 1, "id"],
    ],
    [
      "work in an unknown milestone",
      { newTasks: [{ title: "Draft", milestoneKey: "missing" }] },
      ["newTasks", 0, "milestoneKey"],
    ],
    [
      "a Feature draft",
      { newTasks: [{ title: "x", type: "feature" }] },
      ["newTasks", 0, "type"],
    ],
    ["an unknown field", { startDate: "2026-11-16" }, []],
  ])("rejects %s", (_case, composition, path) => {
    const result = featureCompositionSchema.safeParse(composition);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(path);
  });
});
