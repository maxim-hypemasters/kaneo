import { and, eq, inArray } from "drizzle-orm";
import db from "../database";
import { teamMemberTable, teamTable } from "../database/schema";
import { publishTeamsChanged } from "./publish-teams-changed";

// Team rows outlive the workspace membership unless removed here.
export async function clearRemovedMemberTeams(
  workspaceId: string,
  userId: string,
) {
  const removed = await db
    .delete(teamMemberTable)
    .where(
      and(
        eq(teamMemberTable.userId, userId),
        inArray(
          teamMemberTable.teamId,
          db
            .select({ id: teamTable.id })
            .from(teamTable)
            .where(eq(teamTable.workspaceId, workspaceId)),
        ),
      ),
    )
    .returning({ teamId: teamMemberTable.teamId });
  if (removed.length > 0) await publishTeamsChanged(workspaceId);
}
