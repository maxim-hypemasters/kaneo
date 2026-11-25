import { eq } from "drizzle-orm";
import { teamProjectTable } from "../database/schema";
import type { DbOrTx } from "../project-access/db-or-tx";

export async function readTeamProjectIds(database: DbOrTx, teamId: string) {
  const rows = await database
    .select({ projectId: teamProjectTable.projectId })
    .from(teamProjectTable)
    .where(eq(teamProjectTable.teamId, teamId));
  return rows.map((row) => row.projectId);
}
