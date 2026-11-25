import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { teamProjectTable } from "../../database/schema";
import { applyAccessChange } from "../../project-access/apply-access-change";
import { findInaccessibleProjectIds } from "../../project-access/find-inaccessible-project-ids";
import { findWorkspaceProjectIds } from "../../project-access/find-workspace-project-ids";
import { publishAccessChange } from "../../project-access/publish-access-change";
import { retryTransaction } from "../../utils/retry-transaction";
import { lockTeam } from "../lock-team";
import { publishTeamsChanged } from "../publish-teams-changed";
import { readTeam } from "../read-team";
import { readTeamMemberIds } from "../read-team-member-ids";
import { TEAM_GRANT_DENIED } from "../team-errors";

// Links or unlinks one team and one project. Both are idempotent, so two
// people toggling different teams on a project never undo each other.
export default async function setTeamProjectLink(request: {
  teamId: string;
  projectId: string;
  linked: boolean;
  actorId: string;
}) {
  const { projectId, linked, actorId } = request;
  const { team, outcome } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const team = await lockTeam(tx, request.teamId);
      const [known] = await findWorkspaceProjectIds(
        team.workspaceId,
        [projectId],
        tx,
      );
      if (!known)
        throw new HTTPException(404, { message: "Project not found" });
      if ((await findInaccessibleProjectIds(actorId, [projectId], tx)).length)
        throw new HTTPException(403, { message: TEAM_GRANT_DENIED });

      const [current] = await tx
        .select({ id: teamProjectTable.id })
        .from(teamProjectTable)
        .where(
          and(
            eq(teamProjectTable.teamId, team.id),
            eq(teamProjectTable.projectId, projectId),
          ),
        )
        .limit(1);
      if (Boolean(current) === linked) return { team, outcome: null };

      const { outcome } = await applyAccessChange(
        tx,
        {
          workspaceId: team.workspaceId,
          actorId,
          userIds: await readTeamMemberIds(tx, team.id),
        },
        async () => {
          if (linked)
            await tx
              .insert(teamProjectTable)
              .values({
                workspaceId: team.workspaceId,
                teamId: team.id,
                projectId,
              })
              .onConflictDoNothing();
          else
            await tx
              .delete(teamProjectTable)
              .where(
                and(
                  eq(teamProjectTable.teamId, team.id),
                  eq(teamProjectTable.projectId, projectId),
                ),
              );
        },
      );
      return { team, outcome };
    }),
  );
  if (outcome) {
    await publishAccessChange(team.workspaceId, actorId, outcome);
    await publishTeamsChanged(team.workspaceId);
  }
  return readTeam(team, actorId);
}
