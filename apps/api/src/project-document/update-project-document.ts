import { eq } from "drizzle-orm";
import db from "../database";
import { projectDocumentTable } from "../database/schema";
import { applyCommentAnchors } from "../document-comment/apply-comment-anchors";
import { publishDocumentCommentEvent } from "../document-comment/publish-document-comment-event";
import { ApiError } from "../errors/api-error";
import { lockAuthorizedProject } from "../milestone/access-scope";
import { notifyDocumentMentions } from "../notification/document-mention/notify-document-mentions";
import type { z } from "../openapi";
import { deleteOrphanedAssets } from "../storage/cleanup-assets";
import { claimDocumentAssets } from "../task/controllers/claim-description-assets";
import { retryTransaction } from "../utils/retry-transaction";
import { findProjectDocument } from "./access";
import { authorName } from "./author-name";
import { publishProjectDocumentEvent } from "./publish-project-document-event";
import type { ProjectDocumentScope, updateProjectDocumentBody } from "./schema";

export async function updateProjectDocument(
  scope: ProjectDocumentScope,
  id: string,
  body: z.infer<typeof updateProjectDocumentBody>,
) {
  const { row, oldContent, anchorsMoved } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockAuthorizedProject(tx, scope.projectId, scope.workspaceId);
      const before = await findProjectDocument(tx, scope, id, true);
      if (before.revision !== body.expectedRevision)
        throw new ApiError(409, {
          message: "The document changed since editing began",
          code: "DOCUMENT_CONFLICT",
        });
      const nextBody = body.body ?? before.body;
      await claimDocumentAssets(tx, {
        documentId: id,
        projectId: scope.projectId,
        currentUserId: scope.userId,
        description: nextBody,
        draftAssetIds: body.draftAssetIds,
      });
      const [row] = await tx
        .update(projectDocumentTable)
        .set({
          title: body.title ?? before.title,
          body: nextBody,
          revision: before.revision + 1,
          updatedBy: scope.userId,
          updatedByName: await authorName(tx, scope.userId),
        })
        .where(eq(projectDocumentTable.id, id))
        .returning();
      const anchorsMoved = await applyCommentAnchors(
        tx,
        { kind: "page", documentId: id },
        body.commentAnchors,
      );
      return { row: row!, oldContent: before.body, anchorsMoved };
    }),
  );
  await publishProjectDocumentEvent(scope, "project.document.updated", id);
  await notifyDocumentMentions({
    document: { kind: "page", id, title: row.title },
    projectId: scope.projectId,
    workspaceId: scope.workspaceId,
    authorId: scope.userId,
    before: oldContent,
    after: row.body,
  });
  if (anchorsMoved)
    await publishDocumentCommentEvent(
      { ...scope, kind: "page", documentId: id },
      "anchors",
    );
  if (!body.keepRemovedAssets)
    void deleteOrphanedAssets(oldContent, row.body, { documentId: id }).catch(
      () => {},
    );
  return row;
}
