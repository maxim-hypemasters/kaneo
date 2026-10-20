import { pagingNumber, z } from "../openapi";
import { featureKnowledgeSchema } from "./response";

export const featureLibraryQuery = z.object({
  archived: z.enum(["true", "false"]).optional(),
  search: z.string().trim().max(255).optional(),
  page: pagingNumber(1, 1_000_000).optional(),
  limit: pagingNumber(1, 100).optional(),
});
export const featureLibrarySchema = z.object({
  data: z.array(
    featureKnowledgeSchema.extend({
      assigneeName: z.null(),
      assigneeId: z.null(),
      assigneeImage: z.null(),
      columnId: z.null(),
      labels: z.array(
        z.object({ id: z.string(), name: z.string(), color: z.string() }),
      ),
      milestoneCount: z.number(),
    }),
  ),
  pagination: z.object({
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  }),
});
