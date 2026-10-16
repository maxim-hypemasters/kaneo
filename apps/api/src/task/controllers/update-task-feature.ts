import { setTaskFeature } from "../feature-hierarchy/assign-feature";
import { publishFeatureChange } from "../feature-hierarchy/publish-feature-change";
import { withLockedTask } from "./with-locked-task";

async function updateTaskFeature({
  id,
  featureId,
  currentUserId,
}: {
  id: string;
  featureId: string | null;
  currentUserId: string;
}) {
  const { before, after } = await withLockedTask(id, (tx, task) =>
    setTaskFeature(tx, task, featureId, currentUserId),
  );
  if (before.featureId !== after.featureId) {
    await publishFeatureChange({
      projectId: after.projectId,
      taskId: after.id,
      featureIds: [before.featureId, after.featureId],
      userId: currentUserId,
    });
  }
  return after;
}

export default updateTaskFeature;
