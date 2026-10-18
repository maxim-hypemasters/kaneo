import { setTaskRelease } from "../../release/membership/assign-release";
import { publishReleaseChange } from "../../release/membership/publish-release-change";
import { withLockedTask } from "./with-locked-task";

async function updateTaskRelease({
  id,
  releaseId,
  currentUserId,
}: {
  id: string;
  releaseId: string | null;
  currentUserId: string;
}) {
  const { before, after } = await withLockedTask(id, (tx, task) =>
    setTaskRelease(tx, task, releaseId, currentUserId),
  );
  const { task, movedTaskIds } = after;
  if (before.releaseId !== task.releaseId) {
    await publishReleaseChange({
      projectId: task.projectId,
      taskIds: [task.id, ...movedTaskIds],
      userId: currentUserId,
    });
  }
  return { ...task, movedTaskIds };
}

export default updateTaskRelease;
