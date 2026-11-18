import { eq } from "drizzle-orm";
import db from "../../database";
import { teamTable } from "../../database/schema";
import { applyAccessChange } from "../../project-access/apply-access-change";
import { publishAccessChange } from "../../project-access/publish-access-change";
import { retryTransaction } from "../../utils/retry-transaction";
import { assertSeesTeamProjects } from "../assert-sees-team-projects";
import { lockTeam } from "../lock-team";
import { publishTeamsChanged } from "../publish-teams-changed";
import { readTeamMemberIds } from "../read-team-member-ids";

// Members may lose projects they could only open through this team.
export default async function deleteTeam(request: {
  teamId: string;
  actorId: string;
}) {
  const { actorId } = request;
  const { team, outcome } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const team = await lockTeam(tx, request.teamId);
      await assertSeesTeamProjects(tx, { teamId: team.id, actorId });
      const { outcome } = await applyAccessChange(
        tx,
        {
          workspaceId: team.workspaceId,
          actorId,
          userIds: await readTeamMemberIds(tx, team.id),
        },
        () => tx.delete(teamTable).where(eq(teamTable.id, team.id)),
      );
      return { team, outcome };
    }),
  );
  await publishAccessChange(team.workspaceId, actorId, outcome);
  await publishTeamsChanged(team.workspaceId);
  return { id: team.id };
}
