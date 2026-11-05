import { describe, expect, it } from "vite-plus/test";
import { createTaskBody, updateTaskBody, bulkUpdateBody } from "./schema";
import { estimateSecondsSchema } from "./estimate";
import { createMilestoneBody } from "../milestone/schema";

const creation = { title: "Build", description: "" };
const update = { title: "Build", projectId: "project", position: 0 };

describe("Task/Bug estimate contracts", () => {
  it("accepts optional, cleared and fractional-hour effort in whole minutes", () => {
    for (const type of ["task", "bug"] as const) {
      expect(
        createTaskBody.parse({ ...creation, type }).estimateSeconds,
      ).toBeUndefined();
      expect(
        createTaskBody.parse({ ...creation, type, estimateSeconds: 5400 })
          .estimateSeconds,
      ).toBe(5400);
      expect(
        updateTaskBody.parse({ ...update, estimateSeconds: null })
          .estimateSeconds,
      ).toBeNull();
    }
  });

  it("rejects manual dates, including explicit nulls and empty strings", () => {
    for (const field of ["startDate", "dueDate"])
      for (const value of [null, "", "2026-10-24T10:00:00Z"])
        for (const [schema, body] of [
          [createTaskBody, creation],
          [updateTaskBody, update],
        ] as const)
          expect(schema.safeParse({ ...body, [field]: value }).success).toBe(
            false,
          );
  });

  it("rejects zero, negative, sub-minute, non-integer and overflowing estimates", () => {
    for (const estimateSeconds of [0, -60, 30, 60.5, Infinity, 2_147_483_700])
      expect(estimateSecondsSchema.safeParse(estimateSeconds).success).toBe(
        false,
      );
  });

  it("accepts estimates in atomic milestone and Feature work drafts", () => {
    const draft = { title: "Bug", type: "bug", estimateSeconds: 1800 };
    expect(
      createMilestoneBody.parse({ title: "Milestone", newTasks: [draft] })
        .newTasks,
    ).toEqual([draft]);
    expect(
      createTaskBody.parse({
        ...creation,
        type: "feature",
        featureComposition: {
          milestones: [{ key: "milestone", title: "Milestone" }],
          newTasks: [{ ...draft, milestoneKey: "milestone" }],
        },
      }).featureComposition?.newTasks?.[0]?.estimateSeconds,
    ).toBe(1800);
  });

  it("replaces bulk due-date writes with canonical estimate updates", () => {
    expect(
      bulkUpdateBody.safeParse({
        taskIds: ["task"],
        operation: "updateDueDate",
        value: null,
      }).success,
    ).toBe(false);
    expect(
      bulkUpdateBody.safeParse({
        taskIds: ["task"],
        operation: "updateEstimate",
        value: "3600",
      }).success,
    ).toBe(true);
  });
});
