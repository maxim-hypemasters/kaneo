import { and, asc, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { taskTable } from "../database/schema";
import { setTaskMilestone, type MilestoneTransaction } from "./membership";

// The caller holds the owning Feature FOR UPDATE. Lock selected work in id
// order and validate every row before installing any membership.
export async function linkSelectedMilestoneTasks(
  tx: MilestoneTransaction,
  milestoneId: string,
  feature: { id: string; projectId: string },
  taskIds: readonly string[],
  userId: string,
) {
  if (!taskIds.length) return { taskIds: [], previousMilestoneIds: [] };
  const tasks = await tx
    .select()
    .from(taskTable)
    .where(
      and(
        inArray(taskTable.id, [...taskIds]),
        eq(taskTable.projectId, feature.projectId),
        eq(taskTable.featureId, feature.id),
      ),
    )
    .orderBy(asc(taskTable.id))
    .for("update");
  if (
    tasks.length !== taskIds.length ||
    tasks.some(
      (task) =>
        task.type === "feature" ||
        task.featureId !== feature.id ||
        task.projectId !== feature.projectId,
    )
  ) {
    throw new HTTPException(409, {
      message:
        "Selected work must still be tasks or bugs in this feature. Refresh the selection and try again.",
    });
  }
  for (const task of tasks)
    await setTaskMilestone(tx, task, milestoneId, userId);
  return {
    taskIds: tasks.map((task) => task.id),
    previousMilestoneIds: [
      ...new Set(
        tasks
          .map((task) => task.milestoneId)
          .filter((id): id is string => id !== null),
      ),
    ],
  };
}
