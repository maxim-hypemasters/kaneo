import { and, eq, inArray, ne } from "drizzle-orm";
import { schema } from "../database";
import { removeTriageMemberships } from "../triage/remove-triage-memberships";
import type { AccessChangeOutcome } from "./access-change-outcome";
import type { DbOrTx } from "./db-or-tx";
import { listAccessibleProjectIds } from "./list-accessible-project-ids";
import { unassignInaccessibleTasks } from "./unassign-inaccessible-tasks";

// Runs `mutate` and settles what it did to each user's project access: people
// who lost a project leave its triage list and its tasks are unassigned from
// them, the same as when their own grants change.
export async function applyAccessChange<T>(
  database: DbOrTx,
  change: { workspaceId: string; actorId: string; userIds: Iterable<string> },
  mutate: () => Promise<T>,
): Promise<{ result: T; outcome: AccessChangeOutcome }> {
  const { workspaceId, actorId } = change;
  // Only people limited to selected projects can gain or lose any.
  const candidates = [...new Set(change.userIds)];
  const limited = candidates.length
    ? await database
        .select({ userId: schema.workspaceMemberAccessTable.userId })
        .from(schema.workspaceMemberAccessTable)
        .where(
          and(
            eq(schema.workspaceMemberAccessTable.workspaceId, workspaceId),
            inArray(schema.workspaceMemberAccessTable.userId, candidates),
            ne(schema.workspaceMemberAccessTable.projectAccess, "all"),
          ),
        )
    : [];
  const userIds = limited.map((row) => row.userId);
  const before = new Map<string, Set<string>>();
  for (const userId of userIds)
    before.set(
      userId,
      await listAccessibleProjectIds(database, workspaceId, userId),
    );

  const result = await mutate();

  const outcome: AccessChangeOutcome = {
    changes: [],
    triageProjectIds: [],
    unassigned: [],
  };
  for (const userId of userIds) {
    const had = before.get(userId) ?? new Set<string>();
    const has = await listAccessibleProjectIds(database, workspaceId, userId);
    const lost = [...had].filter((projectId) => !has.has(projectId));
    const gained = [...has].filter((projectId) => !had.has(projectId));
    if (lost.length === 0 && gained.length === 0) continue;

    outcome.changes.push({ userId, projectIds: [...lost, ...gained] });
    if (lost.length === 0) continue;
    outcome.triageProjectIds.push(
      ...(await removeTriageMemberships(database, {
        workspaceId,
        userId,
        projectIds: lost,
      })),
    );
    outcome.unassigned.push(
      ...(await unassignInaccessibleTasks(database, {
        workspaceId,
        userId,
        actorId,
      })),
    );
  }

  return { result, outcome };
}
