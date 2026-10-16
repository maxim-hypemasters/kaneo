import { eq } from "drizzle-orm";
import db from "../database";
import { taskTable } from "../database/schema";

/** Deleted relations are gone by broadcast time; their source task still exists. */
export async function getRelationSourceProject(sourceTaskId: string) {
  return db
    .select({ projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, sourceTaskId));
}
