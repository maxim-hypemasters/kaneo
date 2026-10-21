import { and, asc, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { milestoneTable, taskTable } from "../../database/schema";
import { createMilestoneInTransaction } from "../../milestone/create-milestone-in-transaction";
import { setTaskMilestone } from "../../milestone/membership";
import { lockRelease } from "../../release/membership/assign-release";
import type { FeatureComposition } from "../feature-composition-schema";
import { setTaskFeature } from "../feature-hierarchy/assign-feature";
import {
  createTaskInTransaction,
  type TaskCreationTransaction,
} from "./create-task-in-transaction";
import { initialTaskStatus } from "./initial-task-status";

export async function createFeatureCompositionInTransaction(
  tx: TaskCreationTransaction,
  feature: typeof taskTable.$inferSelect,
  composition: FeatureComposition,
  currentUserId: string,
  expectedWorkspaceId?: string,
) {
  if (feature.type !== "feature")
    throw new HTTPException(400, {
      message: "Only Features can contain creation drafts",
    });
  if (composition.unassignedReleaseId)
    await lockRelease(tx, composition.unassignedReleaseId, feature.projectId);
  const milestones = new Map<string, typeof milestoneTable.$inferSelect>();
  for (const { key, ...fields } of composition.milestones ?? [])
    milestones.set(
      key,
      await createMilestoneInTransaction(tx, feature, fields, currentUserId),
    );

  const selections = composition.existingTasks ?? [];
  const selectedById = new Map(selections.map((task) => [task.id, task]));
  const existing = selections.length
    ? await tx
        .select()
        .from(taskTable)
        .where(
          and(
            eq(taskTable.projectId, feature.projectId),
            inArray(
              taskTable.id,
              selections.map((task) => task.id),
            ),
          ),
        )
        .orderBy(asc(taskTable.id))
        .for("update")
    : [];
  if (
    existing.length !== selections.length ||
    existing.some(
      (task) =>
        task.type === "feature" ||
        task.status === "archived" ||
        task.featureId !== null,
    )
  )
    throw new HTTPException(409, {
      message:
        "Selected work must still be nonarchived Tasks or Bugs without a Feature in this project. Refresh the selection and try again.",
    });
  for (const task of existing) {
    const linked = await setTaskFeature(tx, task, feature.id, currentUserId);
    const key = selectedById.get(task.id)?.milestoneKey;
    if (key)
      await setTaskMilestone(
        tx,
        linked,
        milestones.get(key)!.id,
        currentUserId,
      );
  }

  const createdTasks = [];
  const drafts = composition.newTasks ?? [];
  if (drafts.length) {
    const status = await initialTaskStatus(tx, feature.projectId);
    for (const draft of drafts) {
      const milestone = draft.milestoneKey
        ? milestones.get(draft.milestoneKey)!
        : null;
      const { task } = await createTaskInTransaction(tx, {
        projectId: feature.projectId,
        featureId: feature.id,
        milestoneId: milestone?.id ?? null,
        releaseId: milestone
          ? milestone.releaseId
          : (composition.unassignedReleaseId ?? null),
        currentUserId,
        expectedWorkspaceId,
        title: draft.title,
        type: draft.type,
        status,
      });
      createdTasks.push(task);
    }
  }
  return {
    milestones: [...milestones.values()],
    createdTasks,
    linkedTaskIds: existing.map((task) => task.id),
  };
}
