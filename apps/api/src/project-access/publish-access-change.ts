import { publishEvent } from "../events";
import { publishTriageMembersUpdated } from "../triage/remove-triage-memberships";
import type { AccessChangeOutcome } from "./access-change-outcome";

// Call after the transaction behind `outcome` has committed.
export async function publishAccessChange(
  workspaceId: string,
  actorId: string,
  outcome: AccessChangeOutcome,
) {
  for (const { userId, projectIds } of outcome.changes)
    await publishEvent("project_access.updated", {
      workspaceId,
      userId,
      projectIds,
    });
  await publishTriageMembersUpdated([...new Set(outcome.triageProjectIds)]);
  for (const projectId of new Set(
    outcome.unassigned.map((task) => task.projectId),
  ))
    await publishEvent("task.bulk_unassigned", { projectId, userId: actorId });
}
