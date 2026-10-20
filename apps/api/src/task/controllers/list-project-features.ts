import { and, asc, eq } from "drizzle-orm";
import db from "../../database";
import { taskTable } from "../../database/schema";

// The project's features, for pickers that shouldn't load the whole board.
async function listProjectFeatures(projectId: string) {
  return db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      number: taskTable.number,
      status: taskTable.status,
      releaseId: taskTable.releaseId,
      archivedAt: taskTable.archivedAt,
    })
    .from(taskTable)
    .where(
      and(eq(taskTable.projectId, projectId), eq(taskTable.type, "feature")),
    )
    .orderBy(asc(taskTable.title), asc(taskTable.id));
}

export default listProjectFeatures;
