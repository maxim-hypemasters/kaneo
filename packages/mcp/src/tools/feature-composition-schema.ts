import { z } from "zod";
import { milestoneTaskDraftSchema } from "./milestones.js";

// Mirrors apps/api/src/task/feature-composition-schema.ts.
const milestoneKeySchema = z.string().min(1).max(255);
const optionalNullableId = z.string().min(1).nullable().optional();
const workPlacement = {
  milestoneKey: milestoneKeySchema
    .nullable()
    .optional()
    .describe("The key of a milestone in this request, or null for none"),
};

export const featureCompositionSchema = z
  .object({
    milestones: z
      .array(
        z
          .object({
            key: milestoneKeySchema.describe(
              "Your own key for this milestone, referenced by milestoneKey",
            ),
            title: z.string().trim().min(1).max(255),
            leadId: optionalNullableId,
            priority: z
              .enum(["no-priority", "low", "medium", "high", "urgent"])
              .optional(),
            releaseId: optionalNullableId,
          })
          .strict(),
      )
      .max(100)
      .optional(),
    existingTasks: z
      .array(z.object({ id: z.string().min(1), ...workPlacement }).strict())
      .max(100)
      .optional()
      .describe(
        "Nonarchived Tasks/Bugs of the project with no Feature, moved into the new one",
      ),
    newTasks: z
      .array(milestoneTaskDraftSchema.extend(workPlacement))
      .max(100)
      .optional(),
    unassignedReleaseId: optionalNullableId.describe(
      "Release for new work without a milestone",
    ),
  })
  .strict()
  .superRefine((value, ctx) => {
    const keys = new Set<string>();
    for (const [index, milestone] of (value.milestones ?? []).entries()) {
      if (keys.has(milestone.key))
        ctx.addIssue({
          code: "custom",
          message: "Milestone keys must be unique",
          path: ["milestones", index, "key"],
        });
      keys.add(milestone.key);
    }
    const ids = new Set<string>();
    for (const [index, task] of (value.existingTasks ?? []).entries()) {
      if (ids.has(task.id))
        ctx.addIssue({
          code: "custom",
          message: "Existing task ids must be unique",
          path: ["existingTasks", index, "id"],
        });
      ids.add(task.id);
    }
    for (const field of ["existingTasks", "newTasks"] as const)
      for (const [index, task] of (value[field] ?? []).entries())
        if (task.milestoneKey && !keys.has(task.milestoneKey))
          ctx.addIssue({
            code: "custom",
            message: "Work must reference a milestone in this creation request",
            path: [field, index, "milestoneKey"],
          });
  })
  .describe(
    "Feature only: milestones, links to existing work and title-only Task/Bug drafts, saved atomically with the new Feature.",
  );
