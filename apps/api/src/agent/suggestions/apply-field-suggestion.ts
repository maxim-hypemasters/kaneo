import { assertValidPriority } from "../../task/validate-task-fields";
import updateTaskAssignee from "../../task/controllers/update-task-assignee";
import updateTaskFeature from "../../task/controllers/update-task-feature";
import updateTaskMilestone from "../../task/controllers/update-task-milestone";
import updateTaskPriority from "../../task/controllers/update-task-priority";
import updateTaskRelease from "../../task/controllers/update-task-release";
import type {
  AssigneeSuggestion,
  FeatureSuggestion,
  MilestoneSuggestion,
  PrioritySuggestion,
  ReleaseSuggestion,
} from "../agent-types";
import type { AgentTask } from "../controllers/load-agent-task";

export type SimpleFieldSuggestion =
  | AssigneeSuggestion
  | PrioritySuggestion
  | FeatureSuggestion
  | MilestoneSuggestion
  | ReleaseSuggestion;

/**
 * Sets one field through the task's own controllers, so their checks,
 * activity and live updates apply as for a user edit.
 */
export async function applyFieldSuggestion(
  task: AgentTask["task"],
  suggestion: SimpleFieldSuggestion,
  userId: string,
) {
  const id = task.id;
  const milestone = (milestoneId: string) =>
    updateTaskMilestone({
      id,
      milestoneId,
      currentUserId: userId,
      expectedProjectId: task.projectId,
      expectedWorkspaceId: task.workspaceId,
    });
  switch (suggestion.kind) {
    case "assignee":
      await updateTaskAssignee({
        id,
        userId: suggestion.userId,
        currentUserId: userId,
      });
      return;
    case "priority":
      assertValidPriority(suggestion.priority);
      await updateTaskPriority({
        id,
        priority: suggestion.priority,
        currentUserId: userId,
      });
      return;
    case "feature":
      await updateTaskFeature({
        id,
        featureId: suggestion.featureId,
        currentUserId: userId,
      });
      if (suggestion.milestoneId) await milestone(suggestion.milestoneId);
      return;
    case "milestone":
      await milestone(suggestion.milestoneId);
      return;
    case "release":
      await updateTaskRelease({
        id,
        releaseId: suggestion.releaseId,
        currentUserId: userId,
      });
      return;
  }
}
