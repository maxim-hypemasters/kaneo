import { isoDay } from "../release/release-dates";
import { pagingNumber, responseTimestamp, z } from "../openapi";
import { releaseProgressQuery } from "../release/progress/response";

export const milestoneParam = z.object({ id: z.string().min(1) });
export const featureParam = z.object({ featureId: z.string().min(1) });
const title = z.string().trim().min(1).max(255);
const description = z.string().max(10_000).nullable();
const calendarDate = isoDay.nullable();
export const milestoneScheduleQuery = releaseProgressQuery.extend({
  timeZone: releaseProgressQuery.shape.timeZone.openapi({
    description:
      "IANA timezone used to display the linked work's schedule as calendar dates. Defaults to UTC.",
    example: "Europe/Belgrade",
  }),
});
const planning = {
  leadId: z.string().min(1).nullable().optional(),
  priority: z
    .enum(["no-priority", "low", "medium", "high", "urgent"])
    .optional(),
  releaseId: z.string().min(1).nullable().optional(),
};
export const createMilestoneBody = z
  .object({
    title,
    ...planning,
    description: description.optional(),
    taskIds: z.array(z.string().min(1)).optional().openapi({
      description:
        "Existing Task/Bug ids in this Feature to assign atomically. Existing milestone membership is replaced.",
    }),
  })
  .strict()
  .refine(
    (body) =>
      !body.taskIds || new Set(body.taskIds).size === body.taskIds.length,
    { message: "Task ids must be unique", path: ["taskIds"] },
  );
export const updateMilestoneBody = z
  .object({
    title: title.optional(),
    ...planning,
    description: description.optional(),
  })
  .strict()
  .refine(
    (body) => Object.values(body).some((value) => value !== undefined),
    "At least one field is required",
  );
export const reorderMilestonesBody = z.object({
  milestoneIds: z.array(z.string().min(1)),
});
export const milestoneSchema = z
  .object({
    id: z.string(),
    featureId: z.string(),
    title: z.string(),
    description,
    startDate: calendarDate.openapi({
      readOnly: true,
      description:
        "Earliest scheduled day of linked nonarchived Tasks/Bugs in the requested timezone. Null when no linked work is scheduled.",
    }),
    endDate: calendarDate.openapi({
      readOnly: true,
      description:
        "Latest scheduled day of linked nonarchived Tasks/Bugs in the requested timezone. Null when no linked work is scheduled.",
    }),
    leadId: z.string().nullable(),
    status: z.enum(["to-do", "in-progress", "done"]).openapi({
      readOnly: true,
      description:
        "Derived from all linked nonarchived Tasks/Bugs: nonempty all-Done work is Done; any active or completed work makes unfinished milestones In Progress; otherwise To Do.",
    }),
    columnId: z.null().openapi({
      readOnly: true,
      description:
        "Milestone status is computed and has no assigned workflow column.",
    }),
    priority: z.string(),
    releaseId: z.string().nullable(),
    position: z.number().int(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
    progress: z.object({
      total: z.number().int(),
      started: z.number().int(),
      completed: z.number().int(),
    }),
  })
  .openapi("Milestone");

export const projectMilestonesQuery = milestoneScheduleQuery.extend({
  page: pagingNumber(1, 1_000_000).optional(),
  limit: pagingNumber(1, 100).optional(),
});
export const projectMilestoneSchema = milestoneSchema.extend({
  projectId: z.string(),
  featureTitle: z.string(),
});
export const projectMilestonesSchema = z.object({
  data: z.array(projectMilestoneSchema),
  pagination: z.object({
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  }),
});
