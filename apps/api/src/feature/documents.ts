import { and, count, desc, eq, ilike } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { featureDocumentTable, userTable } from "../database/schema";
import { ApiError } from "../errors/api-error";
import { escapeLikePattern } from "../search/like-pattern";
import { deleteOrphanedAssets } from "../storage/cleanup-assets";
import { boundedTaskRead } from "../task/bounded-read";
import { claimDescriptionAssets } from "../task/controllers/claim-description-assets";
import { retryTransaction } from "../utils/retry-transaction";
import { featureOwner, pagination } from "./access";
import type { z } from "../openapi";
import type {
  createDocumentBody,
  FeatureScope,
  searchQuery,
  updateDocumentBody,
} from "./schema";
import { publishFeatureContent } from "./updates";

export async function listFeatureDocuments(
  scope: FeatureScope,
  query: z.infer<typeof searchQuery>,
) {
  return boundedTaskRead(async (tx) => {
    await featureOwner(tx, scope);
    const where = and(
      eq(featureDocumentTable.featureId, scope.featureId),
      query.search
        ? ilike(
            featureDocumentTable.title,
            `%${escapeLikePattern(query.search)}%`,
          )
        : undefined,
    );
    const [total] = await tx
      .select({ total: count() })
      .from(featureDocumentTable)
      .where(where);
    const rows = await tx
      .select()
      .from(featureDocumentTable)
      .where(where)
      .orderBy(
        desc(featureDocumentTable.updatedAt),
        desc(featureDocumentTable.id),
      )
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);
    return {
      data: rows.map(({ body: _body, ...row }) => row),
      pagination: pagination(total?.total ?? 0, query),
    };
  });
}
export async function getFeatureDocument(
  scope: FeatureScope,
  documentId: string,
) {
  return boundedTaskRead(async (tx) => {
    await featureOwner(tx, scope);
    const [row] = await tx
      .select()
      .from(featureDocumentTable)
      .where(
        and(
          eq(featureDocumentTable.featureId, scope.featureId),
          eq(featureDocumentTable.id, documentId),
        ),
      );
    if (!row)
      throw new HTTPException(404, { message: "Feature document not found" });
    return row;
  });
}
export async function createFeatureDocument(
  scope: FeatureScope,
  body: z.infer<typeof createDocumentBody>,
) {
  const row = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await featureOwner(tx, scope, true);
      const [author] = await tx
        .select({ name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, scope.userId));
      await claimDescriptionAssets(tx, {
        taskId: scope.featureId,
        projectId: scope.projectId,
        currentUserId: scope.userId,
        description: body.body,
        draftAssetIds: body.draftAssetIds,
      });
      const [created] = await tx
        .insert(featureDocumentTable)
        .values({
          featureId: scope.featureId,
          title: body.title,
          body: body.body,
          createdBy: scope.userId,
          updatedBy: scope.userId,
          createdByName: author?.name ?? null,
          updatedByName: author?.name ?? null,
        })
        .returning();
      return created!;
    }),
  );
  await publishFeatureContent(scope, "feature.document.created", row.id);
  return row;
}
export async function updateFeatureDocument(
  scope: FeatureScope,
  id: string,
  body: z.infer<typeof updateDocumentBody>,
) {
  const { row, oldContent } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await featureOwner(tx, scope, true);
      const [before] = await tx
        .select()
        .from(featureDocumentTable)
        .where(
          and(
            eq(featureDocumentTable.featureId, scope.featureId),
            eq(featureDocumentTable.id, id),
          ),
        )
        .for("update");
      if (!before)
        throw new HTTPException(404, { message: "Feature document not found" });
      if (before.revision !== body.expectedRevision)
        throw new ApiError(409, {
          message: "The document changed since editing began",
          code: "DOCUMENT_CONFLICT",
        });
      const [author] = await tx
        .select({ name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, scope.userId));
      await claimDescriptionAssets(tx, {
        taskId: scope.featureId,
        projectId: scope.projectId,
        currentUserId: scope.userId,
        description: body.body ?? before.body,
        draftAssetIds: body.draftAssetIds,
      });
      const [row] = await tx
        .update(featureDocumentTable)
        .set({
          title: body.title ?? before.title,
          body: body.body ?? before.body,
          revision: before.revision + 1,
          updatedBy: scope.userId,
          updatedByName: author?.name ?? null,
        })
        .where(eq(featureDocumentTable.id, id))
        .returning();
      return { row: row!, oldContent: before.body };
    }),
  );
  await publishFeatureContent(scope, "feature.document.updated", id);
  if (!body.keepRemovedAssets)
    void deleteOrphanedAssets(oldContent, row.body, {
      taskId: scope.featureId,
    }).catch(() => {});
  return row;
}
export async function deleteFeatureDocument(scope: FeatureScope, id: string) {
  const row = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await featureOwner(tx, scope, true);
      const [row] = await tx
        .delete(featureDocumentTable)
        .where(
          and(
            eq(featureDocumentTable.featureId, scope.featureId),
            eq(featureDocumentTable.id, id),
          ),
        )
        .returning();
      if (!row)
        throw new HTTPException(404, { message: "Feature document not found" });
      return row;
    }),
  );
  await publishFeatureContent(scope, "feature.document.deleted", id);
  void deleteOrphanedAssets(row.body, null, { taskId: scope.featureId }).catch(
    () => {},
  );
  return row;
}
