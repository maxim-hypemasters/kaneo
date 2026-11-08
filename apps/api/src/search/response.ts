import { responseTimestamp, z } from "../openapi";
import { taskTypeSchema } from "../task/response";

export const searchResultSchema = z
  .object({
    id: z.string(),
    type: z
      .enum([
        "task",
        "feature",
        "project",
        "workspace",
        "comment",
        "activity",
        "document",
      ])
      .openapi({
        description:
          "`task` covers Tasks and Bugs; `feature` is a Feature, which has no status or priority.",
      }),
    taskType: taskTypeSchema.optional().openapi({
      description:
        "For task and feature results, the item's type. For comment and activity results, the type of the item they belong to.",
    }),
    taskId: z.string().optional().openapi({
      description:
        "The Feature, Task or Bug a comment or activity result belongs to.",
    }),
    archived: z.boolean().optional().openapi({
      description: "Whether a feature result is archived.",
    }),
    title: z.string(),
    description: z.string().optional(),
    content: z.string().optional().openapi({
      description:
        "Matched body text, for comment, activity, and document results. Activities get a rendered summary such as `changed status from Todo to In Progress`; documents get a short plain-text excerpt around the match.",
    }),
    featureId: z.string().optional().openapi({
      description:
        "The Feature a document result belongs to; open it with `featureTab=documents` and `featureDocumentId`.",
    }),
    featureTitle: z
      .string()
      .optional()
      .openapi({ description: "The title of a document result's Feature." }),
    projectId: z.string().optional(),
    projectName: z.string().optional(),
    projectSlug: z.string().optional(),
    workspaceId: z.string().optional(),
    workspaceName: z.string().optional(),
    userId: z.string().optional(),
    userName: z.string().optional(),
    createdAt: responseTimestamp,
    relevanceScore: z.number().openapi({
      description:
        "Higher is a better match. Results are sorted by score, then by createdAt descending.",
    }),
    taskNumber: z.number().optional(),
    priority: z.string().optional(),
    status: z.string().optional(),
  })
  .openapi("SearchResult");

export const searchResponseSchema = z
  .object({
    results: z.array(searchResultSchema),
    totalCount: z.number().openapi({
      description:
        "Total matches found before the `limit` slice, so a caller can tell that more exist.",
    }),
    searchQuery: z.string().openapi({ description: "The query that was run." }),
  })
  .openapi("SearchResponse");
