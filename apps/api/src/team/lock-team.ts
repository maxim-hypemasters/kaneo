import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { teamTable } from "../database/schema";
import type { DbOrTx } from "../project-access/db-or-tx";
import { TEAM_NOT_FOUND } from "./team-errors";

// Serializes changes to one team's members and links.
export async function lockTeam(database: DbOrTx, teamId: string) {
  const [team] = await database
    .select({ id: teamTable.id, workspaceId: teamTable.workspaceId })
    .from(teamTable)
    .where(eq(teamTable.id, teamId))
    .for("update");
  if (!team) throw new HTTPException(404, { message: TEAM_NOT_FOUND });
  return team;
}
