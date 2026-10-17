import { and, inArray, notInArray } from "drizzle-orm";
import type db from "../../database";
import { taskTable } from "../../database/schema";
import { recordFeatureChange } from "./record-feature-change";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Call before deleting tasks the caller holds FOR UPDATE. The database takes
// the tasks of a deleted feature out of it, so each task's activity records
// that here; tasks deleted along with their feature are skipped. Its tasks
// are locked so none leaves meanwhile; none can join, since joining locks
// the feature FOR SHARE.
export async function recordFeatureDeletion(
  tx: Tx,
  taskIds: readonly string[],
  userId?: string,
) {
  if (taskIds.length === 0) return;
  const ids = [...taskIds];
  const members = await tx
    .select({
      id: taskTable.id,
      featureId: taskTable.featureId,
      projectId: taskTable.projectId,
    })
    .from(taskTable)
    .where(
      and(inArray(taskTable.featureId, ids), notInArray(taskTable.id, ids)),
    )
    .orderBy(taskTable.id)
    .for("update");

  const byFeature = new Map<string, { projectId: string; ids: string[] }>();
  for (const { id, featureId, projectId } of members) {
    if (!featureId) continue;
    const group = byFeature.get(featureId) ?? { projectId, ids: [] };
    group.ids.push(id);
    byFeature.set(featureId, group);
  }
  for (const [featureId, { projectId, ids }] of byFeature) {
    await recordFeatureChange(tx, {
      taskIds: ids,
      projectId,
      from: featureId,
      to: null,
      userId,
    });
  }
}
