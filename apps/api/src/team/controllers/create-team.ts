import db from "../../database";
import { teamTable } from "../../database/schema";
import { assertTeamNameAvailable } from "../assert-team-name-available";
import { publishTeamsChanged } from "../publish-teams-changed";
import { readTeam } from "../read-team";

export default async function createTeam(request: {
  workspaceId: string;
  name: string;
  actorId: string;
}) {
  const { workspaceId, name } = request;
  const team = await db.transaction(async (tx) => {
    await assertTeamNameAvailable(tx, { workspaceId, name });
    const [created] = await tx
      .insert(teamTable)
      .values({ workspaceId, name })
      .returning({ id: teamTable.id, workspaceId: teamTable.workspaceId });
    if (!created) throw new Error("Team insert returned no row");
    return created;
  });
  await publishTeamsChanged(workspaceId);
  return readTeam(team, request.actorId);
}
