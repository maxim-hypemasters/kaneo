import { and, eq, isNull, max } from "drizzle-orm";
import db from "../database";
import { projectDocumentTable } from "../database/schema";
import type { z } from "../openapi";
import { claimDocumentAssets } from "../task/controllers/claim-description-assets";
import { retryTransaction } from "../utils/retry-transaction";
import { findProjectDocument, lockDocumentTree } from "./access";
import { authorName } from "./author-name";
import { publishProjectDocumentEvent } from "./publish-project-document-event";
import type { createProjectDocumentBody, ProjectDocumentScope } from "./schema";

export async function createProjectDocument(
  scope: ProjectDocumentScope,
  body: z.infer<typeof createProjectDocumentBody>,
) {
  const parentId = body.parentId ?? null;
  const row = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockDocumentTree(tx, scope);
      if (parentId) await findProjectDocument(tx, scope, parentId);
      const [last] = await tx
        .select({ position: max(projectDocumentTable.position) })
        .from(projectDocumentTable)
        .where(
          and(
            eq(projectDocumentTable.projectId, scope.projectId),
            parentId
              ? eq(projectDocumentTable.parentId, parentId)
              : isNull(projectDocumentTable.parentId),
          ),
        );
      const name = await authorName(tx, scope.userId);
      const [created] = await tx
        .insert(projectDocumentTable)
        .values({
          projectId: scope.projectId,
          parentId,
          position: (last?.position ?? -1) + 1,
          title: body.title,
          body: body.body,
          createdBy: scope.userId,
          updatedBy: scope.userId,
          createdByName: name,
          updatedByName: name,
        })
        .returning();
      await claimDocumentAssets(tx, {
        documentId: created!.id,
        projectId: scope.projectId,
        currentUserId: scope.userId,
        description: body.body,
        draftAssetIds: body.draftAssetIds,
      });
      return created!;
    }),
  );
  await publishProjectDocumentEvent(scope, "project.document.created", row.id);
  return row;
}
