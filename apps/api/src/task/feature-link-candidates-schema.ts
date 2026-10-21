import { pagingNumber, z } from "../openapi";

export const featureLinkCandidatesQuery = z.object({
  q: z.string().trim().max(255).optional(),
  page: pagingNumber(1, 1_000_000, 1),
  limit: pagingNumber(1, 100, 50),
});
export type FeatureLinkCandidatesQuery = z.infer<
  typeof featureLinkCandidatesQuery
>;
export const featureLinkCandidatesSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      type: z.enum(["task", "bug"]),
      number: z.number().int().nullable(),
      projectSlug: z.string(),
      releaseId: z.string().nullable(),
      releaseName: z.string().nullable(),
    }),
  ),
  pagination: z.object({
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
  }),
});
