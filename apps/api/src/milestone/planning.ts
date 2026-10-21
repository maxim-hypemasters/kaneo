import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { activityTable, milestoneTable, taskTable } from "../database/schema";
import {
  assertAssignableUser,
  getProjectWorkspaceId,
} from "../utils/assert-assignable-user";
import {
  lockRelease,
  setReleaseOf,
} from "../release/membership/assign-release";
import { recordReleaseChange } from "../release/membership/record-release-change";
import { assertValidPriority } from "../task/validate-task-fields";
import type { MilestoneTransaction } from "./membership";

export type MilestonePlanningFields = {
  leadId?: string | null;
  priority?: string;
  releaseId?: string | null;
};
export function assertReadonlyMilestoneStatus(fields: object) {
  if (Object.hasOwn(fields, "status") || Object.hasOwn(fields, "columnId")) {
    throw new HTTPException(400, {
      message: "Milestone status is derived from linked Tasks and Bugs",
    });
  }
}
export async function resolveMilestonePlanning(
  tx: MilestoneTransaction,
  projectId: string,
  fields: MilestonePlanningFields,
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
  return { ...fields };
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
