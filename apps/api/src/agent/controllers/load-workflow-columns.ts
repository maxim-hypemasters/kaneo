import { eq } from "drizzle-orm";
import db from "../../database";
import { columnTable } from "../../database/schema";
import { resolveWorkflowColumns } from "../workflow-columns";

/** The project's To Do and In Progress columns, as the agent moves work. */
export async function loadWorkflowColumns(projectId: string) {
  const columns = await db
    .select({
      id: columnTable.id,
      slug: columnTable.slug,
      name: columnTable.name,
      position: columnTable.position,
      isFinal: columnTable.isFinal,
    })
    .from(columnTable)
    .where(eq(columnTable.projectId, projectId));
  return resolveWorkflowColumns(columns);
}
