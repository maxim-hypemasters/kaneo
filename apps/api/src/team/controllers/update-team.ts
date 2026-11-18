import { eq } from "drizzle-orm";
import db from "../../database";
import { teamTable } from "../../database/schema";
import { assertTeamNameAvailable } from "../assert-team-name-available";
import { lockTeam } from "../lock-team";
import { publishTeamsChanged } from "../publish-teams-changed";
import { readTeam } from "../read-team";

export default async function updateTeam(request: {
  teamId: string;
  name: string;
  actorId: string;
}) {
  const team = await db.transaction(async (tx) => {
    const locked = await lockTeam(tx, request.teamId);
    await assertTeamNameAvailable(tx, {
      workspaceId: locked.workspaceId,
      name: request.name,
      exceptTeamId: locked.id,
    });
    await tx
      .update(teamTable)
      .set({ name: request.name })
      .where(eq(teamTable.id, locked.id));
    return locked;
  });
  await publishTeamsChanged(team.workspaceId);
  return readTeam(team, request.actorId);
}
