import { responseTimestamp, z } from "../openapi";

const day = z.string().openapi({ format: "date", example: "2026-10-20" });

export const releaseSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    startDate: day,
    codeFreezeDate: day,
    submissionDate: day,
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi({
    description:
      "A planned delivery in one project, holding milestones, Tasks and Bugs. Dates are calendar days (YYYY-MM-DD) with no time zone, ordered start ≤ code freeze ≤ submission. The phase isn't stored: compare the viewer's local today with the dates. Upcoming before the start date; in progress from the start date until the day before code freeze; code freeze from the code freeze date through the submission date; past submission after the submission date.",
  })
  .openapi("Release");

const itemCounts = z.object({
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative().openapi({
    description: "Items in a final column.",
  }),
});

export const releaseWithProgressSchema = releaseSchema
  .extend({
    progress: z
      .object({
        tasks: itemCounts.openapi({
          description: "Tasks and bugs counted together.",
        }),
        features: itemCounts.openapi({
          description:
            "Distinct Feature knowledge groups referenced by work or milestones. Completed is always zero.",
        }),
        milestones: itemCounts.optional(),
        unfinished: z.number().int().nonnegative().openapi({
          description:
            "Tasks, Bugs and milestones neither archived nor in a final column, which Move unfinished would move.",
        }),
      })
      .openapi({
        description:
          "The release's execution work and distinct Feature knowledge groups. Tasks and Bugs share the task counts. Milestone completion follows its manual workflow status. Archived execution items count in totals.",
      }),
  })
  .openapi("ReleaseWithProgress");

export const releaseListSchema = z.array(releaseWithProgressSchema);

export const releaseMilestoneSchema = z
  .object({
    id: z.string(),
    featureId: z.string(),
    title: z.string(),
    position: z.number().int(),
    featureTitle: z.string(),
    leadId: z.string().nullable(),
    status: z.string(),
    columnId: z.string().nullable(),
    priority: z.string(),
    releaseId: z.string().nullable(),
    startDate: day.nullable(),
    endDate: day.nullable(),
  })
  .openapi("ReleaseMilestone");

export const releaseMilestoneListSchema = z.array(releaseMilestoneSchema);

export const deletedReleaseSchema = z
  .object({ id: z.string() })
  .openapi("DeletedRelease");

export const movedReleaseItemsSchema = z
  .object({
    movedMilestoneIds: z.array(z.string()),
    movedTaskIds: z.array(z.string()).openapi({
      description:
        "The Tasks and Bugs that moved, ordered by id; completed work stays.",
    }),
  })
  .openapi("MovedReleaseItems");
