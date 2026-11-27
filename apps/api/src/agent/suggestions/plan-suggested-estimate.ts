import type { ReadinessSuggestion } from "../agent-types";
import type { AgentTask } from "../controllers/load-agent-task";
import type { PermissionCheck } from "./load-suggestion-facts";
import { planEstimateDates } from "./plan-estimate-dates";

export type SuggestedEstimatePlan = {
  assigneeId: string;
  // The dates are for the suggested assignee, whom Apply assigns first.
  suggestedAssignee: boolean;
  startDate: Date;
  dueDate: Date;
};

/**
 * The dates an estimate suggestion would set: planned for the assignee, or
 * else for the suggested assignee when the viewer may assign them. None when
 * the task has dates already, or for viewers who may not see time off, since
 * dates planned around it reveal it.
 */
export async function planSuggestedEstimate({
  task,
  minutes,
  visible,
  can,
}: {
  task: AgentTask["task"];
  minutes: number;
  visible: readonly ReadinessSuggestion[];
  can: PermissionCheck;
}): Promise<SuggestedEstimatePlan | null> {
  if (task.startDate || task.dueDate || !can({ time_off: ["read"] }))
    return null;
  const suggested = visible.find((item) => item.kind === "assignee");
  const assignee = task.userId
    ? { assigneeId: task.userId, suggestedAssignee: false }
    : suggested?.kind === "assignee" && can({ task: ["assign"] })
      ? { assigneeId: suggested.userId, suggestedAssignee: true }
      : null;
  if (!assignee) return null;
  const dates = await planEstimateDates({
    workspaceId: task.workspaceId,
    assigneeId: assignee.assigneeId,
    minutes,
    timeZone: task.planningTimeZone ?? "UTC",
    excludeTaskId: task.id,
  });
  return dates && { ...assignee, ...dates };
}
