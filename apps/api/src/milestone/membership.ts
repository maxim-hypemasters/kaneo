import { recordReleaseChange } from "../release/membership/record-release-change";
import { lockRelease } from "../release/membership/assign-release";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../database";
import { milestoneTable, taskTable } from "../database/schema";
import createActivities from "../activity/controllers/create-activities";
import { lockFeature } from "../task/feature-hierarchy/assign-feature";

export type MilestoneTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
type Task = typeof taskTable.$inferSelect;

// Lock the owning Feature before the milestone so conversion, moves and
// deletion cannot invalidate a membership being installed in this transaction.
export async function lockMilestone(
  tx: MilestoneTransaction,
  milestoneId: string,
  featureId: string | null | undefined,
  projectId: string,
) {
  if (!featureId)
    throw new HTTPException(409, { message: "A milestone requires a feature" });
  await lockFeature(tx, featureId, projectId);
  const [milestone] = await tx
    .select()
    .from(milestoneTable)
    .where(
      and(
        eq(milestoneTable.id, milestoneId),
        eq(milestoneTable.featureId, featureId),
      ),
    )
    .for("share");
  if (!milestone)
    throw new HTTPException(404, {
      message: "Milestone not found in this feature",
    });
  return milestone;
}

async function titleOf(tx: MilestoneTransaction, id: string | null) {
  if (!id) return null;
  const [row] = await tx
    .select({ title: milestoneTable.title })
    .from(milestoneTable)
    .where(eq(milestoneTable.id, id));
  return row?.title ?? null;
}

export async function recordMilestoneChange(
  tx: MilestoneTransaction,
  {
    taskIds,
    projectId,
    from,
    to,
    userId,
  }: {
    taskIds: readonly string[];
    projectId: string;
    from: string | null;
    to: string | null;
    userId?: string;
  },
) {
  if (from === to || !taskIds.length) return;
  const eventData = {
    projectId,
    oldMilestoneId: from,
    oldMilestoneTitle: await titleOf(tx, from),
    newMilestoneId: to,
    newMilestoneTitle: await titleOf(tx, to),
  };
  await createActivities(
    taskIds.map((taskId) => ({
      taskId,
      type: "milestone_changed",
      userId: userId ?? null,
      content: null,
      eventData,
    })),
    tx,
  );
}

export async function setTaskMilestone(
  tx: MilestoneTransaction,
  task: Task,
  milestoneId: string | null,
  userId?: string,
) {
  if (task.milestoneId === milestoneId) return task;
  let releaseId = task.releaseId;
  if (milestoneId) {
    if (task.type === "feature")
      throw new HTTPException(409, {
        message: "Features cannot belong to milestones",
      });
    const milestone = await lockMilestone(
      tx,
      milestoneId,
      task.featureId,
      task.projectId,
    );
    if (releaseId === null && milestone.releaseId) {
      await lockRelease(tx, milestone.releaseId, task.projectId);
      releaseId = milestone.releaseId;
    }
  }
  const [updated] = await tx
    .update(taskTable)
    .set({ milestoneId, releaseId })
    .where(eq(taskTable.id, task.id))
    .returning();
  if (!updated) throw new HTTPException(404, { message: "Task not found" });
  await recordReleaseChange(tx, {
    taskIds: [task.id],
    projectId: task.projectId,
    from: task.releaseId,
    to: releaseId,
    userId,
  });
  await recordMilestoneChange(tx, {
    taskIds: [task.id],
    projectId: task.projectId,
    from: task.milestoneId,
    to: milestoneId,
    userId,
  });
  return updated;
}
