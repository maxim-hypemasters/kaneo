import {
  setTaskType,
  type TaskType,
} from "../feature-hierarchy/assign-feature";
import { publishFeatureChange } from "../feature-hierarchy/publish-feature-change";
import { withLockedTask } from "./with-locked-task";

async function updateTaskType({
  id,
  type,
  currentUserId,
}: {
  id: string;
  type: TaskType;
  currentUserId: string;
}) {
  const { before, after } = await withLockedTask(id, (tx, task) =>
    setTaskType(tx, task, type, currentUserId),
  );
  if (before.type !== after.type) {
    // A task becoming a feature leaves its feature, whose progress changes.
    await publishFeatureChange({
      projectId: after.projectId,
      taskId: after.id,
      featureIds: [before.featureId],
      userId: currentUserId,
    });
  }
  return after;
}

export default updateTaskType;
