import { z } from "../openapi";
import { milestoneTaskDraftSchema } from "../milestone/schema";

const milestoneKey = z.string().min(1).max(255);
const workPlacement = { milestoneKey: milestoneKey.nullable().optional() };

export const featureCompositionSchema = z
  .object({
    milestones: z
      .array(
        z
          .object({
            key: milestoneKey,
            title: z.string().trim().min(1).max(255),
            leadId: z.string().min(1).nullable().optional(),
            priority: z
              .enum(["no-priority", "low", "medium", "high", "urgent"])
              .optional(),
            releaseId: z.string().min(1).nullable().optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    existingTasks: z
      .array(z.object({ id: z.string().min(1), ...workPlacement }).strict())
      .max(100)
      .optional(),
    newTasks: z
      .array(milestoneTaskDraftSchema.extend(workPlacement))
      .max(100)
      .optional(),
    unassignedReleaseId: z.string().min(1).nullable().optional(),
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
  });

export type FeatureCompositionInput = z.input<typeof featureCompositionSchema>;
export type FeatureComposition = z.infer<typeof featureCompositionSchema>;
