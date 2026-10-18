import { z } from "../openapi";
import { isoDay } from "./release-dates";

export const projectIdParam = z.object({ projectId: z.string() });

export const releaseParam = z.object({ id: z.string() });

const name = z.string().trim().min(1).max(100).openapi({
  description: "Unique within the project. Surrounding spaces are trimmed.",
});
const description = z.string().max(10_000).nullable();
const startDate = isoDay.openapi({ description: "The first day of work." });
const codeFreezeDate = isoDay.openapi({
  description: "The day changes stop. On or after the start date.",
});
const submissionDate = isoDay.openapi({
  description: "The day the release ships. On or after the code freeze date.",
});

export const createReleaseBody = z.object({
  name,
  description: description.optional(),
  startDate,
  codeFreezeDate,
  submissionDate,
});

export const updateReleaseBody = z.object({
  name: name.optional(),
  description: description.optional().openapi({
    description: "Null clears the description.",
  }),
  startDate: startDate.optional(),
  codeFreezeDate: codeFreezeDate.optional(),
  submissionDate: submissionDate.optional(),
});

export const moveUnfinishedBody = z.object({
  targetReleaseId: z.string().min(1).nullable().openapi({
    description:
      "Another release of the same project, or null to take the items out of every release.",
  }),
});

export type CreateReleaseInput = z.infer<typeof createReleaseBody>;
export type UpdateReleaseInput = z.infer<typeof updateReleaseBody>;
