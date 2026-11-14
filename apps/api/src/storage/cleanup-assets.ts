import { and, asc, eq, inArray, like } from "drizzle-orm";
import db from "../database";
import {
  activityTable,
  assetTable,
  commentTable,
  featureDocumentTable,
  projectDocumentTable,
  taskTable,
} from "../database/schema";
import { deleteS3Object } from "./s3";

const ASSET_URL_PATTERN = /\/api\/asset\/([a-z0-9]+)/gi;

export function extractAssetIds(
  content: string | null | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (!content) return ids;

  ASSET_URL_PATTERN.lastIndex = 0;
  for (
    let match = ASSET_URL_PATTERN.exec(content);
    match !== null;
    match = ASSET_URL_PATTERN.exec(content)
  ) {
    if (match[1]) ids.add(match[1]);
  }

  return ids;
}

export function contentReferencesAsset(
  content: string | null | undefined,
  assetId: string,
): boolean {
  return extractAssetIds(content).has(assetId);
}

// Task uploads are shared by the task's description, comments, activity and
// Feature documents. A project document's uploads belong to that page alone.
export type AssetCleanupScope = { taskId: string } | { documentId: string };

function assetOwnerFilter(scope: AssetCleanupScope) {
  return "taskId" in scope
    ? eq(assetTable.taskId, scope.taskId)
    : eq(assetTable.documentId, scope.documentId);
}

async function isAssetReferencedElsewhere(
  assetId: string,
  scope: AssetCleanupScope,
  executor: Pick<typeof db, "select"> = db,
): Promise<boolean> {
  return "taskId" in scope
    ? isAssetReferencedByTask(assetId, scope.taskId, executor)
    : isAssetReferencedByDocument(assetId, scope.documentId, executor);
}

async function isAssetReferencedByDocument(
  assetId: string,
  documentId: string,
  executor: Pick<typeof db, "select">,
): Promise<boolean> {
  const [document] = await executor
    .select({ body: projectDocumentTable.body })
    .from(projectDocumentTable)
    .where(eq(projectDocumentTable.id, documentId))
    .limit(1);
  return contentReferencesAsset(document?.body, assetId);
}

/**
 * Check whether an asset ID is still referenced in any content belonging to
 * the same task (description, comments, activity comments or documents).
 */
async function isAssetReferencedByTask(
  assetId: string,
  taskId: string,
  executor: Pick<typeof db, "select">,
): Promise<boolean> {
  const pattern = `%/api/asset/${assetId}%`;

  const [taskRef] = await executor
    .select({ description: taskTable.description })
    .from(taskTable)
    .where(and(eq(taskTable.id, taskId), like(taskTable.description, pattern)))
    .limit(1);

  if (contentReferencesAsset(taskRef?.description, assetId)) return true;

  const commentRefs = await executor
    .select({ content: commentTable.content })
    .from(commentTable)
    .where(
      and(eq(commentTable.taskId, taskId), like(commentTable.content, pattern)),
    );

  if (commentRefs.some((ref) => contentReferencesAsset(ref.content, assetId))) {
    return true;
  }

  const activityRefs = await executor
    .select({ content: activityTable.content })
    .from(activityTable)
    .where(
      and(
        eq(activityTable.taskId, taskId),
        like(activityTable.content, pattern),
      ),
    );

  if (
    activityRefs.some((ref) => contentReferencesAsset(ref.content, assetId))
  ) {
    return true;
  }

  const documentRefs = await executor
    .select({ body: featureDocumentTable.body })
    .from(featureDocumentTable)
    .where(
      and(
        eq(featureDocumentTable.featureId, taskId),
        like(featureDocumentTable.body, pattern),
      ),
    );
  return documentRefs.some((ref) => contentReferencesAsset(ref.body, assetId));
}

export async function deleteOrphanedAssets(
  oldContent: string | null | undefined,
  newContent: string | null | undefined,
  scope: AssetCleanupScope,
): Promise<void> {
  const oldIds = extractAssetIds(oldContent);
  const newIds = extractAssetIds(newContent);

  const removedIds = [...oldIds].filter((id) => !newIds.has(id));
  if (removedIds.length === 0) return;

  const assets = await db
    .select({ id: assetTable.id, objectKey: assetTable.objectKey })
    .from(assetTable)
    .where(and(inArray(assetTable.id, removedIds), assetOwnerFilter(scope)));

  const assetsToDelete: typeof assets = [];
  for (const asset of assets) {
    const stillReferenced = await isAssetReferencedElsewhere(asset.id, scope);
    if (!stillReferenced) {
      assetsToDelete.push(asset);
    }
  }

  if (assetsToDelete.length === 0) return;

  const deleteResults = await deleteS3Keys(
    assetsToDelete.map((asset) => asset.objectKey),
  );

  const deletedAssetIds = assetsToDelete
    .filter((_, index) => deleteResults[index]?.status === "fulfilled")
    .map((asset) => asset.id);

  if (deletedAssetIds.length === 0) return;

  await db.delete(assetTable).where(inArray(assetTable.id, deletedAssetIds));
}

/**
 * Delete the owner's assets among `assetIds` that none of its content still
 * references. Callers lock the owning row first; rows are then locked by id
 * like claimDescriptionAssets does. The asset_storage_cleanup trigger queues
 * each deleted object key, and retryStorageCleanup removes it from storage
 * once the transaction has committed.
 */
export async function deleteUnreferencedAssets(
  tx: Pick<typeof db, "select" | "delete">,
  scope: AssetCleanupScope,
  assetIds: string[],
): Promise<string[]> {
  const ids = [...new Set(assetIds)];
  if (ids.length === 0) return [];

  const assets = await tx
    .select({ id: assetTable.id })
    .from(assetTable)
    .where(and(inArray(assetTable.id, ids), assetOwnerFilter(scope)))
    .orderBy(asc(assetTable.id))
    .for("update");

  const deletable: string[] = [];
  for (const asset of assets) {
    if (!(await isAssetReferencedElsewhere(asset.id, scope, tx)))
      deletable.push(asset.id);
  }
  if (deletable.length === 0) return [];

  await tx.delete(assetTable).where(inArray(assetTable.id, deletable));
  return deletable;
}

export async function getTaskAssetKeys(taskId: string): Promise<string[]> {
  const assets = await db
    .select({ objectKey: assetTable.objectKey })
    .from(assetTable)
    .where(eq(assetTable.taskId, taskId));

  return assets.map((a) => a.objectKey);
}

export async function deleteS3Keys(
  keys: string[],
): Promise<PromiseSettledResult<void>[]> {
  const deleteResults = await Promise.allSettled(
    keys.map((key) => deleteS3Object(key)),
  );

  const failedDeletions = keys
    .map((key, index) => ({ key, result: deleteResults[index] }))
    .filter(
      (
        deletion,
      ): deletion is {
        key: string;
        result: PromiseRejectedResult;
      } => deletion.result?.status === "rejected",
    );

  if (failedDeletions.length > 0) {
    console.error(
      "Failed to delete S3 objects",
      failedDeletions.map(({ key, result }) => ({
        key,
        reason: result.reason,
      })),
    );
  }

  return deleteResults;
}
