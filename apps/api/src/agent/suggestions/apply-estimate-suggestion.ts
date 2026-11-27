import updateTaskAssignee from "../../task/controllers/update-task-assignee";
import { updateTaskEstimatePlan } from "../../task/controllers/update-task-estimate-plan";
import type { EstimateSuggestion, ReadinessSuggestion } from "../agent-types";
import type { AgentTask } from "../controllers/load-agent-task";
import { removeSuggestion } from "../controllers/remove-suggestion";
import type { PermissionCheck } from "./load-suggestion-facts";
import { planSuggestedEstimate } from "./plan-suggested-estimate";

/**
 * Sets the estimate, with dates planned again now. Dates planned for the
 * suggested assignee assign that person first, which settles their
 * suggestion too. Without a plan only the estimate is set.
 */
export async function applyEstimateSuggestion({
  task,
  suggestion,
  visible,
  userId,
  can,
}: {
  task: AgentTask["task"];
  suggestion: EstimateSuggestion;
  visible: readonly ReadinessSuggestion[];
  userId: string;
  can: PermissionCheck;
}) {
  const plan = await planSuggestedEstimate({
    task,
    minutes: suggestion.minutes,
    visible,
    can,
  });
  if (plan?.suggestedAssignee) {
    await updateTaskAssignee({
      id: task.id,
      userId: plan.assigneeId,
      currentUserId: userId,
    });
    const assignee = visible.find((item) => item.kind === "assignee");
    if (assignee) await removeSuggestion(task.id, assignee.id).catch(() => {});
  }
  await updateTaskEstimatePlan({
    id: task.id,
    estimateSeconds: suggestion.minutes * 60,
    ...(plan ? { startDate: plan.startDate, dueDate: plan.dueDate } : {}),
    currentUserId: userId,
  });
  return {
    assigneeChanged: plan?.suggestedAssignee ?? false,
    datesChanged: plan !== null,
  };
}
