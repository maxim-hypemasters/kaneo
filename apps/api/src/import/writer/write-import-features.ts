import { inArray } from "drizzle-orm";
import type db from "../../database";
import { taskTable } from "../../database/schema";
import { chunk } from "./chunk";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Runs once every task is written: tasks go in by chunks, and a feature link
// must point at a row that already exists.
export async function writeImportFeatures(
  tx: Transaction,
  {
    features,
    memberships,
  }: { features: readonly string[]; memberships: ReadonlyMap<string, string> },
) {
  for (const ids of chunk(features)) {
    await tx
      .update(taskTable)
      .set({ type: "feature" })
      .where(inArray(taskTable.id, ids));
  }
  const byFeature = new Map<string, string[]>();
  for (const [taskId, featureId] of memberships) {
    byFeature.set(featureId, [...(byFeature.get(featureId) ?? []), taskId]);
  }
  for (const [featureId, taskIds] of byFeature) {
    for (const ids of chunk(taskIds)) {
      await tx
        .update(taskTable)
        .set({ featureId })
        .where(inArray(taskTable.id, ids));
    }
  }
}
