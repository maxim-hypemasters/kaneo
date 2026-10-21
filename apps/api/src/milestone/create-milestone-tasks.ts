import { milestoneTable, taskTable } from "../database/schema";
import { createTaskInTransaction } from "../task/controllers/create-task-in-transaction";
import { initialTaskStatus } from "../task/controllers/initial-task-status";
import type { MilestoneTransaction } from "./membership";
import type { MilestoneTaskDraft } from "./schema";

export async function createMilestoneTasks(
  tx: MilestoneTransaction,
  feature: typeof taskTable.$inferSelect,
  milestone: typeof milestoneTable.$inferSelect,
  drafts: readonly MilestoneTaskDraft[],
  currentUserId: string,
  expectedWorkspaceId?: string,
) {
  if (!drafts.length) return [];
  const status = await initialTaskStatus(tx, feature.projectId);
  const created = [];
  for (const draft of drafts) {
    const { task } = await createTaskInTransaction(tx, {
      projectId: feature.projectId,
      featureId: feature.id,
      milestoneId: milestone.id,
      releaseId: milestone.releaseId,
      currentUserId,
      expectedWorkspaceId,
      title: draft.title,
      type: draft.type,
      status,
    });
    created.push(task);
  }
  return created;
}
