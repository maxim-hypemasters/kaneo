import { recordMilestoneActivity } from "../../milestone/planning";
import { publishMilestoneChange } from "../../milestone/write-milestones";
import { asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { milestoneTable, releaseTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { pgErrorCode, pgErrorConstraint } from "../../utils/pg-error-code";
import { retryTransaction } from "../../utils/retry-transaction";
import { isTransactionConflict } from "../../utils/transaction-conflict";
import { setReleaseOf } from "../membership/assign-release";
import { publishReleaseChange } from "../membership/publish-release-change";
import { recordReleaseChange } from "../membership/record-release-change";

// A task that joins the release after its members were locked (created in a
// feature that's in it, say) passes the foreign key check while the release
// still exists, and then the delete trips it.
const joinedMeanwhile = (error: unknown) =>
  pgErrorCode(error) === "23503" &&
  pgErrorConstraint(error) === "task_release_fk";

// Locking the members by id can also deadlock with paths that lock a feature
// before its tasks or a task before its feature. Either way the whole
// transaction rolled back, so it runs again.
const retryable = (error: unknown) =>
  joinedMeanwhile(error) || isTransactionConflict(error);

// Its features and tasks stay, out of every release, each recording that in
// its activity while the release's name can still be read.
function unlinkAndDelete(id: string, userId: string) {
  return db.transaction(async (tx) => {
    const members = await tx
      .select({ id: taskTable.id, projectId: taskTable.projectId })
      .from(taskTable)
      .where(eq(taskTable.releaseId, id))
      .orderBy(asc(taskTable.id))
      .for("update");
    const memberIds = members.map((member) => member.id);
    await setReleaseOf(tx, memberIds, null);
    if (members[0]) {
      await recordReleaseChange(tx, {
        taskIds: memberIds,
        projectId: members[0].projectId,
        from: id,
        to: null,
        userId,
      });
    }
    const milestones = await tx
      .select()
      .from(milestoneTable)
      .where(eq(milestoneTable.releaseId, id))
      .orderBy(asc(milestoneTable.id))
      .for("update");
    for (const milestone of milestones) {
      await recordMilestoneActivity(
        tx,
        milestone.featureId,
        milestone,
        "milestone_updated",
        userId,
        { releaseId: { from: id, to: null } },
      );
      await tx
        .update(milestoneTable)
        .set({ releaseId: null })
        .where(eq(milestoneTable.id, milestone.id));
    }
    const [deleted] = await tx
      .delete(releaseTable)
      .where(eq(releaseTable.id, id))
      .returning({ id: releaseTable.id, projectId: releaseTable.projectId });
    if (!deleted) {
      throw new HTTPException(404, { message: "Release not found" });
    }
    return { ...deleted, memberIds, milestones };
  });
}

async function unlinkAndDeleteRetrying(id: string, userId: string) {
  try {
    return await retryTransaction(() => unlinkAndDelete(id, userId), retryable);
  } catch (error) {
    if (!joinedMeanwhile(error)) throw error;
    throw new HTTPException(409, {
      message: "The release is changing; try again",
    });
  }
}

async function deleteRelease(id: string, userId: string) {
  const { projectId, memberIds, milestones } = await unlinkAndDeleteRetrying(
    id,
    userId,
  );
  await publishReleaseChange({ projectId, taskIds: memberIds, userId });
  await publishEvent("release.changed", { projectId });
  for (const milestone of milestones)
    await publishMilestoneChange(
      projectId,
      milestone.featureId,
      milestone.id,
      userId,
    );
  return { id };
}

export default deleteRelease;
