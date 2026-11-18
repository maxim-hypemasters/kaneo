import { eq } from "drizzle-orm";
import db from "../../database";
import { workspaceUserTable } from "../../database/schema";
import { broadcastToUser } from "../../ws";

// The message carries no data: clients refetch through the checked route,
// which hides linked projects each viewer can't access.
export async function broadcastTeamsChanged(workspaceId: string) {
  const members = await db
    .select({ userId: workspaceUserTable.userId })
    .from(workspaceUserTable)
    .where(eq(workspaceUserTable.workspaceId, workspaceId));
  for (const userId of new Set(members.map((member) => member.userId)))
    broadcastToUser(userId, { type: "TEAMS_UPDATED", workspaceId });
}
