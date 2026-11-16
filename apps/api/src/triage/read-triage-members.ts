import { and, asc, eq } from "drizzle-orm";
import db from "../database";
import { projectTriageMemberTable } from "../database/schema";
import { projectAccessCondition } from "../project-access/project-access-condition";

type Database = Pick<typeof db, "select">;

// Members who lost access to the project no longer triage it.
export async function getTriageMemberIds(
  projectId: string,
  database: Database = db,
) {
  const rows = await database
    .select({ userId: projectTriageMemberTable.userId })
    .from(projectTriageMemberTable)
    .where(
      and(
        eq(projectTriageMemberTable.projectId, projectId),
        projectAccessCondition(projectTriageMemberTable.userId, projectId),
      ),
    )
    .orderBy(
      asc(projectTriageMemberTable.createdAt),
      asc(projectTriageMemberTable.id),
    );
  return rows.map((row) => row.userId);
}

export async function readTriageRouting(
  projectId: string,
  userId: string | null | undefined,
  database: Database = db,
) {
  const memberIds = await getTriageMemberIds(projectId, database);
  return {
    triageEnabled: memberIds.length > 0,
    isMember: !!userId && memberIds.includes(userId),
  };
}
