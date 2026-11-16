import { and, eq, inArray } from "drizzle-orm";
import db from "../database";
import { projectTriageMemberTable } from "../database/schema";
import { publishEvent } from "../events";
import type { DbOrTx } from "../project-access/db-or-tx";

// Called when someone leaves a workspace or loses access to projects.
export async function removeTriageMemberships(
  database: DbOrTx,
  {
    workspaceId,
    userId,
    projectIds,
  }: { workspaceId: string; userId: string; projectIds?: string[] },
) {
  if (projectIds && projectIds.length === 0) return [];
  const removed = await database
    .delete(projectTriageMemberTable)
    .where(
      and(
        eq(projectTriageMemberTable.workspaceId, workspaceId),
        eq(projectTriageMemberTable.userId, userId),
        projectIds
          ? inArray(projectTriageMemberTable.projectId, projectIds)
          : undefined,
      ),
    )
    .returning({ projectId: projectTriageMemberTable.projectId });
  return [...new Set(removed.map((row) => row.projectId))];
}

export async function publishTriageMembersUpdated(projectIds: string[]) {
  for (const projectId of projectIds)
    await publishEvent("project.triage_members_updated", { projectId });
}

// For removals outside a transaction: drop the rows, then tell open boards.
export async function dropTriageMemberships(
  workspaceId: string,
  userId: string,
) {
  await publishTriageMembersUpdated(
    await removeTriageMemberships(db, { workspaceId, userId }),
  );
}
