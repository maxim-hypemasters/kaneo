import { HTTPException } from "hono/http-exception";
import db from "../database";
import { readTeams } from "./read-teams";
import { TEAM_NOT_FOUND } from "./team-errors";

export async function readTeam(
  team: { id: string; workspaceId: string },
  viewerId: string,
) {
  const [view] = await readTeams(db, {
    workspaceId: team.workspaceId,
    viewerId,
    teamIds: [team.id],
  });
  if (!view) throw new HTTPException(404, { message: TEAM_NOT_FOUND });
  return view;
}
