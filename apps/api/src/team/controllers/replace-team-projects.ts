import { and, eq, inArray } from "drizzle-orm";
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
import { readTeamProjectIds } from "../read-team-project-ids";
import { TEAM_GRANT_DENIED } from "../team-errors";

export default async function replaceTeamProjects(request: {
  teamId: string;
  projectIds: string[];
  actorId: string;
}) {
  const { actorId } = request;
  const ids = [...new Set(request.projectIds)];
  const { team, outcome } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const team = await lockTeam(tx, request.teamId);
      const known = await findWorkspaceProjectIds(team.workspaceId, ids, tx);
      if (known.length !== ids.length)
        throw new HTTPException(400, {
          message: "Some projects don't belong to this workspace",
        });

      const current = await readTeamProjectIds(tx, team.id);
      const newlyLinked = ids.filter((id) => !current.includes(id));
      if (
        (await findInaccessibleProjectIds(actorId, newlyLinked, tx)).length > 0
      )
        throw new HTTPException(403, { message: TEAM_GRANT_DENIED });

      // Links the actor can't see aren't theirs to remove.
      const hidden = await findInaccessibleProjectIds(actorId, current, tx);
      const next = new Set([...ids, ...hidden]);
      const removed = current.filter((id) => !next.has(id));
      if (newlyLinked.length === 0 && removed.length === 0)
        return { team, outcome: null };

      const { outcome } = await applyAccessChange(
        tx,
        {
          workspaceId: team.workspaceId,
          actorId,
          userIds: await readTeamMemberIds(tx, team.id),
        },
        async () => {
          if (removed.length)
            await tx
              .delete(teamProjectTable)
              .where(
                and(
                  eq(teamProjectTable.teamId, team.id),
                  inArray(teamProjectTable.projectId, removed),
                ),
              );
          if (newlyLinked.length)
            await tx
              .insert(teamProjectTable)
              .values(
                newlyLinked.map((projectId) => ({
                  workspaceId: team.workspaceId,
                  teamId: team.id,
                  projectId,
                })),
              )
              .onConflictDoNothing();
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
