import { recordMilestoneActivity } from "../../milestone/planning";
import { publishMilestoneChange } from "../../milestone/write-milestones";
import { and, asc, eq, not } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { milestoneTable, releaseTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { retryTransaction } from "../../utils/retry-transaction";
import { lockRelease, setReleaseOf } from "../membership/assign-release";
import { publishReleaseChange } from "../membership/publish-release-change";
import { recordReleaseChange } from "../membership/record-release-change";
import { isUnfinishedItem } from "../unfinished-item";
import { milestoneIsCompleted } from "../../milestone/completion";

// Moves each unfinished item on its own: a feature's tasks don't follow it
// here, so a finished task stays in the release it shipped in.
async function moveUnfinishedItems(
  id: string,
  targetReleaseId: string | null,
  userId: string,
) {
  if (targetReleaseId === id) {
    throw new HTTPException(400, {
      message: "Choose another release to move the unfinished items to",
    });
  }
  const [source] = await db
    .select({ projectId: releaseTable.projectId })
    .from(releaseTable)
    .where(eq(releaseTable.id, id));
  if (!source) throw new HTTPException(404, { message: "Release not found" });
  const { projectId } = source;

  // Locking the items by id can deadlock with paths that lock a feature
  // before its tasks or a task before its feature; that runs it again.
  const { movedTaskIds, milestones } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const items = await tx
        .select({ id: taskTable.id })
        .from(taskTable)
        .where(
          and(
            eq(taskTable.releaseId, id),
            eq(taskTable.projectId, projectId),
            isUnfinishedItem,
          ),
        )
        .orderBy(asc(taskTable.id))
        .for("update");
      if (targetReleaseId) await lockRelease(tx, targetReleaseId, projectId);
      const ids = items.map((item) => item.id);
      await setReleaseOf(tx, ids, targetReleaseId);
      await recordReleaseChange(tx, {
        taskIds: ids,
        projectId,
        from: id,
        to: targetReleaseId,
        userId,
      });
      const milestones = await tx
        .select({ milestone: milestoneTable })
        .from(milestoneTable)
        .innerJoin(taskTable, eq(taskTable.id, milestoneTable.featureId))
        .where(
          and(
            eq(taskTable.projectId, projectId),
            eq(taskTable.type, "feature"),
            eq(milestoneTable.releaseId, id),
            not(milestoneIsCompleted),
          ),
        )
        .orderBy(asc(milestoneTable.id))
        .for("update", { of: milestoneTable });
      for (const { milestone } of milestones) {
        await tx
          .update(milestoneTable)
          .set({ releaseId: targetReleaseId })
          .where(eq(milestoneTable.id, milestone.id));
        await recordMilestoneActivity(
          tx,
          milestone.featureId,
          milestone,
          "milestone_updated",
          userId,
          { releaseId: { from: id, to: targetReleaseId } },
        );
      }
      return {
        movedTaskIds: ids,
        milestones: milestones.map((row) => row.milestone),
      };
    }),
  );

  await publishReleaseChange({ projectId, taskIds: movedTaskIds, userId });
  await publishEvent("release.changed", { projectId });
  for (const milestone of milestones)
    await publishMilestoneChange(
      projectId,
      milestone.featureId,
      milestone.id,
      userId,
    );
  return { movedTaskIds, movedMilestoneIds: milestones.map((row) => row.id) };
}

export default moveUnfinishedItems;
