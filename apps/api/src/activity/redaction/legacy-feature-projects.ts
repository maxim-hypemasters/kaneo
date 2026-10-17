import { inArray } from "drizzle-orm";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { eventDataOf } from "./event-data";

// The current project of the task and each feature named by "feature_changed"
// events written before they stored a project. Empty, without a query, when
// there are none.
export async function legacyFeatureProjects(
  rows: ReadonlyArray<{ type: string; taskId: string; eventData: unknown }>,
) {
  const ids = new Set<string>();
  for (const row of rows) {
    const data = row.type === "feature_changed" && eventDataOf(row.eventData);
    if (!data || typeof data.projectId === "string") continue;
    ids.add(row.taskId);
    for (const id of [data.oldFeatureId, data.newFeatureId]) {
      if (typeof id === "string") ids.add(id);
    }
  }
  if (ids.size === 0) return new Map<string, string>();

  const tasks = await db
    .select({ id: taskTable.id, projectId: taskTable.projectId })
    .from(taskTable)
    .where(inArray(taskTable.id, [...ids]));
  return new Map(tasks.map((task) => [task.id, task.projectId]));
}
