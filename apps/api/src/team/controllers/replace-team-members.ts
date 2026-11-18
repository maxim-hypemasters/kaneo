import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { teamMemberTable, workspaceUserTable } from "../../database/schema";
import { applyAccessChange } from "../../project-access/apply-access-change";
import { publishAccessChange } from "../../project-access/publish-access-change";
import { retryTransaction } from "../../utils/retry-transaction";
import { assertSeesTeamProjects } from "../assert-sees-team-projects";
import { lockTeam } from "../lock-team";
import { publishTeamsChanged } from "../publish-teams-changed";
import { readTeam } from "../read-team";
import { readTeamMemberIds } from "../read-team-member-ids";

export default async function replaceTeamMembers(request: {
  teamId: string;
  userIds: string[];
  actorId: string;
}) {
  const { actorId } = request;
  const ids = [...new Set(request.userIds)];
  const { team, outcome, changed } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const team = await lockTeam(tx, request.teamId);
      const members = ids.length
        ? await tx
            .select({ userId: workspaceUserTable.userId })
            .from(workspaceUserTable)
            .where(
              and(
                eq(workspaceUserTable.workspaceId, team.workspaceId),
                inArray(workspaceUserTable.userId, ids),
              ),
            )
        : [];
      const memberIds = new Set(members.map((member) => member.userId));
      if (ids.some((id) => !memberIds.has(id)))
        throw new HTTPException(400, {
          message: "Team members must be members of the workspace",
        });

      const current = await readTeamMemberIds(tx, team.id);
      const added = ids.filter((id) => !current.includes(id));
      const removed = current.filter((id) => !ids.includes(id));
      if (added.length === 0 && removed.length === 0)
        return { team, outcome: null, changed: false };
      await assertSeesTeamProjects(tx, { teamId: team.id, actorId });

      const { outcome } = await applyAccessChange(
        tx,
        {
          workspaceId: team.workspaceId,
          actorId,
          userIds: [...added, ...removed],
        },
        async () => {
          if (removed.length)
            await tx
              .delete(teamMemberTable)
              .where(
                and(
                  eq(teamMemberTable.teamId, team.id),
                  inArray(teamMemberTable.userId, removed),
                ),
              );
          if (added.length)
            await tx
              .insert(teamMemberTable)
              .values(added.map((userId) => ({ teamId: team.id, userId })))
              .onConflictDoNothing();
        },
      );
      return { team, outcome, changed: true };
    }),
  );
  if (outcome) await publishAccessChange(team.workspaceId, actorId, outcome);
  if (changed) await publishTeamsChanged(team.workspaceId);
  return readTeam(team, actorId);
}
