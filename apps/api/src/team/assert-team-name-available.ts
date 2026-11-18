import { and, eq, ne, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { teamTable, workspaceTable } from "../database/schema";
import type { DbOrTx } from "../project-access/db-or-tx";
import { TEAM_NAME_TAKEN } from "./team-errors";

export async function assertTeamNameAvailable(
  database: DbOrTx,
  request: { workspaceId: string; name: string; exceptTeamId?: string },
) {
  // Holding the workspace row makes concurrent creates and renames take
  // turns, so two can't claim the same name. NO KEY UPDATE leaves inserts
  // that reference the workspace unblocked.
  await database
    .select({ id: workspaceTable.id })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, request.workspaceId))
    .for("no key update");

  const [taken] = await database
    .select({ id: teamTable.id })
    .from(teamTable)
    .where(
      and(
        eq(teamTable.workspaceId, request.workspaceId),
        sql`lower(${teamTable.name}) = lower(${request.name})`,
        request.exceptTeamId
          ? ne(teamTable.id, request.exceptTeamId)
          : undefined,
      ),
    )
    .limit(1);
  if (taken) throw new HTTPException(409, { message: TEAM_NAME_TAKEN });
}
