import { eq } from "drizzle-orm";
import db from "../../database";
import { workspaceAgentRunnerTable } from "../../database/schema";

export async function revokeRunner(workspaceId: string) {
  await db
    .delete(workspaceAgentRunnerTable)
    .where(eq(workspaceAgentRunnerTable.workspaceId, workspaceId));
}
