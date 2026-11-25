import { HTTPException } from "hono/http-exception";
import type { DbOrTx } from "../project-access/db-or-tx";
import { findInaccessibleProjectIds } from "../project-access/find-inaccessible-project-ids";
import { readTeamProjectIds } from "./read-team-project-ids";
import { TEAM_GRANT_DENIED } from "./team-errors";

// Changing who is in a team, or deleting it, changes access to every linked
// project, so the actor must be able to open all of them.
export async function assertSeesTeamProjects(
  database: DbOrTx,
  request: { teamId: string; actorId: string },
) {
  const linked = await readTeamProjectIds(database, request.teamId);
  const hidden = await findInaccessibleProjectIds(
    request.actorId,
    linked,
    database,
  );
  if (hidden.length > 0)
    throw new HTTPException(403, { message: TEAM_GRANT_DENIED });
}
