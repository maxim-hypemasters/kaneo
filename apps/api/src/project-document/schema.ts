import {
  createDocumentBody,
  pruneAssetsResultSchema,
  updateDocumentBody,
} from "../feature/schema";
import { responseTimestamp, z } from "../openapi";

export const projectParams = z.object({ projectId: z.string().min(1) });
export const documentParams = z.object({ id: z.string().min(1) });

export const createProjectDocumentBody = createDocumentBody
  .extend({
    parentId: z.string().min(1).nullable().optional().openapi({
      description:
        "Page to nest the new page under. Omit or send null for the top level. The page is added as the parent's last child.",
    }),
  })
  .strict();

export const updateProjectDocumentBody = updateDocumentBody
  .extend({
    keepRemovedAssets: z.boolean().optional().openapi({
      description:
        "Keep uploads this save removes from the body instead of deleting them right away, so autosaves can survive cut and paste or undo. Release them later with POST /project-document/{id}/assets/prune; uploads that are never pruned are deleted with the page.",
    }),
  })
  .strict();

export const moveProjectDocumentBody = z
  .object({
    parentId: z.string().min(1).nullable().openapi({
      description:
        "New parent page in the same project, or null for the top level. It cannot be the page itself or one of its sub-pages.",
    }),
    index: z.number().int().min(0).max(100_000).openapi({
      description:
        "Position among the new parent's children, counted without the moved page. Larger values place it last.",
    }),
  })
  .strict();

export const pruneProjectDocumentAssetsBody = z
  .object({
    assetIds: z.array(z.string().min(1)).min(1).max(100).openapi({
      description:
        "Uploads to delete. Ids that are not this page's uploads, or that its body still references, are skipped.",
    }),
  })
  .strict();

export { pruneAssetsResultSchema };

export const projectDocumentSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    parentId: z.string().nullable(),
    position: z.number().int(),
    title: z.string(),
    body: z.string(),
    revision: z.number().int(),
    createdBy: z.string().nullable(),
    updatedBy: z.string().nullable(),
    createdByName: z.string().nullable(),
    updatedByName: z.string().nullable(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("ProjectDocument");

export const projectDocumentTreeSchema = z
  .object({
    pages: z.array(
      projectDocumentSchema.pick({
        id: true,
        parentId: true,
        position: true,
        title: true,
        updatedByName: true,
        updatedAt: true,
      }),
    ),
    features: z.array(
      z.object({
        id: z.string(),
        number: z.number().nullable(),
        title: z.string(),
        documents: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            updatedAt: responseTimestamp,
          }),
        ),
      }),
    ),
  })
  .openapi("ProjectDocumentTree");

export const deletedProjectDocumentSchema = z.object({
  id: z.string(),
  deletedCount: z.number().int().openapi({
    description: "Pages deleted, counting the page and all of its sub-pages.",
  }),
});

export type ProjectDocumentScope = {
  projectId: string;
  workspaceId: string;
  userId: string;
};
