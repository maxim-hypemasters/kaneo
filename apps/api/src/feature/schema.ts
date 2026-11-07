import { activitySchema } from "../activity/response";
import {
  nullableResponseTimestamp,
  pagingNumber,
  responseTimestamp,
  z,
} from "../openapi";

export const featureParams = z.object({ id: z.string().min(1) });
export const documentParams = featureParams.extend({
  documentId: z.string().min(1),
});
export const updateParams = featureParams.extend({
  updateId: z.string().min(1),
});
export const pageQuery = z.object({
  page: pagingNumber(1, 1_000_000).default(1),
  limit: pagingNumber(1, 100).default(50),
});
export const searchQuery = pageQuery.extend({
  search: z.string().trim().max(255).optional(),
});
export const paginationSchema = z.object({
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});
export const healthSchema = z.enum(["on-track", "at-risk", "off-track"]);
export const milestoneSnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  position: z.number().int(),
  total: z.number().int(),
  started: z.number().int(),
  completed: z.number().int(),
  previousTotal: z.number().int().nullable(),
  previousCompleted: z.number().int().nullable(),
});
export const featureUpdateEventSchema = z.object({
  projectId: z.string(),
  health: healthSchema,
  milestones: z.array(milestoneSnapshotSchema),
});
export const featureActivitySchema = activitySchema.extend({
  userName: z.string().nullable(),
  userImage: z.string().nullable(),
});
export const featureReportSchema = featureActivitySchema
  .extend({
    type: z.literal("feature_update"),
    eventData: z.union([
      featureUpdateEventSchema,
      z.object({
        projectId: z.null(),
        health: z.null(),
        milestones: z.array(milestoneSnapshotSchema).length(0),
        redacted: z.literal(true),
      }),
    ]),
  })
  .openapi("FeatureUpdate");
export const activityPageSchema = z.object({
  data: z.array(featureActivitySchema),
  pagination: paginationSchema,
});
export const updateBody = z
  .object({
    note: z.string().trim().min(1).max(100_000),
    health: healthSchema,
    draftAssetIds: z.array(z.string().min(1)).max(100).optional(),
  })
  .strict();
const documentFields = {
  title: z.string().trim().min(1).max(255),
  body: z.string().max(1_000_000),
};
export const createDocumentBody = z
  .object({
    title: documentFields.title,
    body: documentFields.body.default(""),
    draftAssetIds: z.array(z.string().min(1)).max(100).optional(),
  })
  .strict();
export const updateDocumentBody = z
  .object({
    title: documentFields.title.optional(),
    body: documentFields.body.optional(),
    expectedRevision: z.number().int().min(1),
    draftAssetIds: z.array(z.string().min(1)).max(100).optional(),
  })
  .strict();
export const documentSchema = z.object({
  id: z.string(),
  featureId: z.string(),
  title: z.string(),
  body: z.string(),
  revision: z.number().int(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  createdByName: z.string().nullable(),
  updatedByName: z.string().nullable(),
  createdAt: responseTimestamp,
  updatedAt: responseTimestamp,
});
export const documentPageSchema = z.object({
  data: z.array(documentSchema.omit({ body: true })),
  pagination: paginationSchema,
});
export const issuesQuery = searchQuery.extend({
  milestoneId: z.string().min(1).optional(),
  archived: z.enum(["exclude", "include", "only"]).default("exclude"),
});
export const issueSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  projectSlug: z.string(),
  title: z.string(),
  type: z.enum(["task", "bug"]),
  createdAt: responseTimestamp,
  updatedAt: responseTimestamp,
  descriptionDeferred: z.literal(true),
  number: z.number().nullable(),
  position: z.number().nullable(),
  status: z.string(),
  priority: z.string(),
  userId: z.string().nullable(),
  assignee: z
    .object({ id: z.string(), name: z.string(), image: z.string().nullable() })
    .nullable(),
  featureId: z.string(),
  milestoneId: z.string().nullable(),
  releaseId: z.string().nullable(),
  releaseName: z.string().nullable(),
  estimateSeconds: z.number().nullable(),
  startDate: nullableResponseTimestamp,
  dueDate: nullableResponseTimestamp,
  archivedAt: nullableResponseTimestamp,
  columnId: z.string().nullable(),
});
export const issuePageSchema = z.object({
  data: z.array(issueSchema),
  groups: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      position: z.number(),
      isFinal: z.boolean(),
      total: z.number(),
    }),
  ),
  pagination: paginationSchema,
});
export type FeatureScope = {
  featureId: string;
  projectId: string;
  workspaceId: string;
  userId: string;
};
export type FeaturePage = z.infer<typeof pageQuery>;
