import { eq } from "drizzle-orm";
import { teamMemberTable } from "../database/schema";
import type { DbOrTx } from "../project-access/db-or-tx";

export async function readTeamMemberIds(database: DbOrTx, teamId: string) {
  const rows = await database
    .select({ userId: teamMemberTable.userId })
    .from(teamMemberTable)
    .where(eq(teamMemberTable.teamId, teamId));
  return rows.map((row) => row.userId);
}
