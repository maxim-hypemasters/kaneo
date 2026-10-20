import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  activityTable,
  columnTable,
  milestoneTable,
  taskTable,
} from "../database/schema";
import {
  assertAssignableUser,
  getProjectWorkspaceId,
} from "../utils/assert-assignable-user";
import {
  lockRelease,
  setReleaseOf,
} from "../release/membership/assign-release";
import { recordReleaseChange } from "../release/membership/record-release-change";
import {
  assertValidPriority,
  assertValidTaskStatus,
} from "../task/validate-task-fields";
import type { MilestoneTransaction } from "./membership";

export type MilestonePlanningFields = {
  leadId?: string | null;
  status?: string;
  priority?: string;
  releaseId?: string | null;
};
export async function resolveMilestonePlanning(
  tx: MilestoneTransaction,
  projectId: string,
  fields: MilestonePlanningFields,
  creating = false,
) {
  if (fields.leadId)
    await assertAssignableUser(
      fields.leadId,
      await getProjectWorkspaceId(projectId, tx),
      projectId,
      tx,
    );
  if (fields.releaseId) await lockRelease(tx, fields.releaseId, projectId);
  if (fields.priority) assertValidPriority(fields.priority);
  let status = fields.status;
  if (creating && status === undefined) {
    const [first] = await tx
      .select({ slug: columnTable.slug })
      .from(columnTable)
      .where(
        and(
          eq(columnTable.projectId, projectId),
          eq(columnTable.isFinal, false),
        ),
      )
      .orderBy(asc(columnTable.position), asc(columnTable.id))
      .limit(1);
    status = first?.slug ?? "planned";
  }
  if (status === undefined) return { ...fields };
  await assertValidTaskStatus(status, projectId, tx);
  const [column] = await tx
    .select({ id: columnTable.id })
    .from(columnTable)
    .where(
      and(eq(columnTable.projectId, projectId), eq(columnTable.slug, status)),
    )
    .orderBy(asc(columnTable.position), asc(columnTable.id))
    .limit(1);
  return { ...fields, status, columnId: column?.id ?? null };
}
export async function recordMilestoneActivity(
  tx: MilestoneTransaction,
  featureId: string,
  milestone: { id: string; title: string },
  type: string,
  userId: string,
  changes: unknown = {},
  historicalProjectId?: string,
) {
  const [feature] = await tx
    .select({ projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, featureId));
  await tx.insert(activityTable).values({
    taskId: featureId,
    type,
    userId,
    content: null,
    eventData: {
      projectId: historicalProjectId ?? feature?.projectId,
      milestoneId: milestone.id,
      milestoneTitle: milestone.title,
      changes,
    },
  });
}
export async function moveMilestoneFollowers(
  tx: MilestoneTransaction,
  current: typeof milestoneTable.$inferSelect,
  projectId: string,
  releaseId: string | null,
  userId: string,
) {
  const followers = await tx
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, projectId),
        eq(taskTable.milestoneId, current.id),
        inArray(taskTable.type, ["task", "bug"]),
        current.releaseId === null
          ? isNull(taskTable.releaseId)
          : eq(taskTable.releaseId, current.releaseId),
      ),
    )
    .orderBy(asc(taskTable.id))
    .for("update");
  if (releaseId) await lockRelease(tx, releaseId, projectId);
  const ids = followers.map((row) => row.id);
  await setReleaseOf(tx, ids, releaseId);
  await recordReleaseChange(tx, {
    taskIds: ids,
    projectId,
    from: current.releaseId,
    to: releaseId,
    userId,
  });
  return ids;
}

export async function milestoneStatusIsDone(
  tx: MilestoneTransaction,
  projectId: string,
  milestone: { columnId: string | null; status: string },
) {
  const [column] = await tx
    .select({ isFinal: columnTable.isFinal })
    .from(columnTable)
    .where(
      and(
        eq(columnTable.projectId, projectId),
        milestone.columnId
          ? eq(columnTable.id, milestone.columnId)
          : eq(columnTable.slug, milestone.status),
      ),
    )
    .orderBy(asc(columnTable.position), asc(columnTable.id))
    .limit(1);
  return column?.isFinal ?? false;
}
