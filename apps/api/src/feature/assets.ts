import db from "../database";
import { deleteUnreferencedAssets } from "../storage/cleanup-assets";
import { retryTransaction } from "../utils/retry-transaction";
import { featureOwner } from "./access";
import type { FeatureScope } from "./schema";

export async function pruneFeatureAssets(
  scope: FeatureScope,
  assetIds: string[],
) {
  const deletedAssetIds = await retryTransaction(() =>
    db.transaction(async (tx) => {
      // Locks the Feature row first, as document saves do, so a save that
      // references an asset again commits before its references are checked.
      await featureOwner(tx, scope, true);
      return deleteUnreferencedAssets(
        tx,
        { taskId: scope.featureId },
        assetIds,
      );
    }),
  );
  return { deletedAssetIds };
}
