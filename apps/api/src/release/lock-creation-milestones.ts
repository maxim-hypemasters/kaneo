import { and, asc, eq, inArray } from "drizzle-orm";
import { milestoneTable, taskTable } from "../database/schema";
import { ApiError } from "../errors/api-error";
import type { MilestoneTransaction } from "../milestone/membership";

function selectionConflict() {
  return new ApiError(409, {
    code: "MILESTONE_SELECTION_CONFLICT",
    message:
      "Selected milestones changed or are no longer unassigned in this project; review the selection and try again",
  });
}

export async function lockCreationMilestones(
  tx: MilestoneTransaction,
  projectId: string,
  ids: readonly string[],
) {
  if (!ids.length) return [];
  const owners = await tx
    .select({ id: milestoneTable.id, featureId: milestoneTable.featureId })
    .from(milestoneTable)
    .innerJoin(taskTable, eq(taskTable.id, milestoneTable.featureId))
    .where(
      and(
        inArray(milestoneTable.id, ids),
        eq(taskTable.projectId, projectId),
        eq(taskTable.type, "feature"),
      ),
    );
  if (owners.length !== ids.length) throw selectionConflict();
  const featureIds = [...new Set(owners.map((row) => row.featureId))];
  const features = await tx
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(
      and(
        inArray(taskTable.id, featureIds),
        eq(taskTable.projectId, projectId),
        eq(taskTable.type, "feature"),
      ),
    )
    .orderBy(asc(taskTable.id))
    .for("update");
  if (features.length !== featureIds.length) throw selectionConflict();
  const milestones = await tx
    .select()
    .from(milestoneTable)
    .where(inArray(milestoneTable.id, ids))
    .orderBy(asc(milestoneTable.id))
    .for("update");
  const ownerById = new Map(owners.map((row) => [row.id, row.featureId]));
  if (
    milestones.length !== ids.length ||
    milestones.some(
      (row) =>
        row.releaseId !== null || row.featureId !== ownerById.get(row.id),
    )
  )
    throw selectionConflict();
  return milestones;
}
