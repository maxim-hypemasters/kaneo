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
      "A planned delivery in one project, holding its features and tasks. Dates are calendar days (YYYY-MM-DD) with no time zone, ordered start ≤ code freeze ≤ submission. The phase isn't stored: compare the viewer's local today with the dates. Upcoming before the start date; in progress from the start date until the day before code freeze; code freeze from the code freeze date through the submission date; past submission after the submission date.",
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
        features: itemCounts,
        unfinished: z.number().int().nonnegative().openapi({
          description:
            "Tasks, bugs and features neither archived nor in a final column, which Move unfinished would move.",
        }),
      })
      .openapi({
        description:
          "The release's tasks, bugs and features. Tasks and bugs share the tasks counts. Archived items count in the totals.",
      }),
  })
  .openapi("ReleaseWithProgress");

export const releaseListSchema = z.array(releaseWithProgressSchema);

export const deletedReleaseSchema = z
  .object({ id: z.string() })
  .openapi("DeletedRelease");

export const movedReleaseItemsSchema = z
  .object({
    movedTaskIds: z.array(z.string()).openapi({
      description: "The tasks and features that moved, ordered by id.",
    }),
  })
  .openapi("MovedReleaseItems");
