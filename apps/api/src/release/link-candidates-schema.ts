import { pagingNumber, z } from "../openapi";

export const releaseLinkCandidatesQuery = z.object({
  kind: z.enum(["task", "milestone"]).openapi({
    description: "Task candidates include Bugs.",
  }),
  q: z.string().trim().max(255).optional(),
  page: pagingNumber(1, 1_000_000, 1),
  limit: pagingNumber(1, 100, 50),
});

export const releaseMilestoneLinkCandidatesQuery =
  releaseLinkCandidatesQuery.omit({ kind: true });

export const releaseLinkCandidateSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    type: z.enum(["task", "bug", "milestone"]),
    number: z.number().int().nullable(),
    featureId: z.string().nullable(),
    featureTitle: z.string().nullable(),
    projectSlug: z.string(),
    releaseId: z.string().nullable(),
    releaseName: z.string().nullable(),
  })
  .openapi("ReleaseLinkCandidate");

const pagination = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});

export const releaseLinkCandidatesSchema = z.object({
  data: z.array(releaseLinkCandidateSchema),
  pagination,
});

export const releaseMilestoneLinkCandidatesSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      featureId: z.string(),
      featureTitle: z.string(),
    }),
  ),
  pagination,
});

export type ReleaseLinkCandidatesQuery = z.infer<
  typeof releaseLinkCandidatesQuery
>;

export type ReleaseMilestoneLinkCandidatesQuery = z.infer<
  typeof releaseMilestoneLinkCandidatesQuery
>;
