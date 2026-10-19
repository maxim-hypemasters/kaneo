import { lockAuthorizedProject } from "../../milestone/access-scope";
import { HTTPException } from "hono/http-exception";
import { setTaskMilestone } from "../../milestone/membership";
import { publishMilestoneChange } from "../../milestone/write-milestones";
import { publishFeatureChange } from "../feature-hierarchy/publish-feature-change";
import { withLockedTask } from "./with-locked-task";

export default async function updateTaskMilestone({
  id,
  milestoneId,
  currentUserId,
  expectedProjectId,
  expectedWorkspaceId,
}: {
  id: string;
  milestoneId: string | null;
  currentUserId: string;
  expectedProjectId?: string;
  expectedWorkspaceId?: string;
}) {
  const { before, after } = await withLockedTask(
    id,
    async (tx, task) => {
      if (expectedProjectId && task.projectId !== expectedProjectId)
        throw new HTTPException(409, {
          message: "Task changed projects; retry the request",
        });
      return setTaskMilestone(tx, task, milestoneId, currentUserId);
    },
    (tx) => lockAuthorizedProject(tx, expectedProjectId, expectedWorkspaceId),
  );
  if (before.milestoneId !== after.milestoneId) {
    await publishFeatureChange({
      projectId: after.projectId,
      taskId: id,
      featureIds: [after.featureId],
      userId: currentUserId,
    });
    if (after.featureId)
      await publishMilestoneChange(
        after.projectId,
        after.featureId,
        milestoneId,
        currentUserId,
      );
  }
  return after;
}
