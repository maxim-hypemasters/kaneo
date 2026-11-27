import type { TaskAgent } from "@/fetchers/agent/get-task-agent";
import { TRIAGE_STATUS } from "@/lib/triage/triage-status";

/**
 * Where the task sits for the agent: questions show in Triage and To Do,
 * Start and Ship only in To Do.
 */
export type TaskStage = "triage" | "todo" | "other";

export function taskStage(
  status: string | null | undefined,
  workflow: Pick<TaskAgent["workflow"], "todoStatus">,
): TaskStage {
  if (status === TRIAGE_STATUS) return "triage";
  if (status && status === workflow.todoStatus) return "todo";
  return "other";
}
