import db from "../../database";
import { publishEvent } from "../../events";
import { lockAuthorizedProject } from "../../milestone/access-scope";
import { updateMilestoneInTransaction } from "../../milestone/update-milestone-in-transaction";
import { publishMilestoneChange } from "../../milestone/write-milestones";
import { retryTransaction } from "../../utils/retry-transaction";
import { lockCreationMilestones } from "../lock-creation-milestones";
import { assertReleaseDateOrder } from "../release-dates";
import type { CreateReleaseInput } from "../schema";
import { insertReleaseInTransaction } from "../write-release-in-transaction";

async function createRelease(
  projectId: string,
  input: CreateReleaseInput,
  userId: string,
  expectedWorkspaceId?: string,
) {
  assertReleaseDateOrder(input);
  const result = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockAuthorizedProject(tx, projectId, expectedWorkspaceId);
      const milestones = await lockCreationMilestones(
        tx,
        projectId,
        input.milestoneIds ?? [],
      );
      const created = await insertReleaseInTransaction(tx, projectId, input);
      const movedTaskIds = new Set<string>();
      for (const milestone of milestones) {
        const moved = await updateMilestoneInTransaction(
          tx,
          milestone,
          projectId,
          { releaseId: created.id },
          userId,
        );
        for (const id of moved.movedTaskIds) movedTaskIds.add(id);
      }
      return { created, milestones, movedTaskIds: [...movedTaskIds] };
    }),
  );
  await publishEvent("release.changed", { projectId });
  for (const milestone of result.milestones)
    await publishMilestoneChange(
      projectId,
      milestone.featureId,
      milestone.id,
      userId,
    );
  for (const taskId of result.movedTaskIds)
    await publishEvent("task.updated", { taskId, projectId, userId });
  return result.created;
}

export default createRelease;
