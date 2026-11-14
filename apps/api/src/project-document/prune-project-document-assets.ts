import db from "../database";
import { lockAuthorizedProject } from "../milestone/access-scope";
import { deleteUnreferencedAssets } from "../storage/cleanup-assets";
import { retryTransaction } from "../utils/retry-transaction";
import { findProjectDocument } from "./access";
import type { ProjectDocumentScope } from "./schema";

export async function pruneProjectDocumentAssets(
  scope: ProjectDocumentScope,
  id: string,
  assetIds: string[],
) {
  const deletedAssetIds = await retryTransaction(() =>
    db.transaction(async (tx) => {
      // Locks the page first, as saves do, so a save that references an
      // upload again commits before its references are checked.
      await lockAuthorizedProject(tx, scope.projectId, scope.workspaceId);
      await findProjectDocument(tx, scope, id, true);
      return deleteUnreferencedAssets(tx, { documentId: id }, assetIds);
    }),
  );
  return { deletedAssetIds };
}
