import type { TaskAgent } from "@/fetchers/agent/get-task-agent";

type AutoAssessInput = Pick<
  TaskAgent,
  | "enabled"
  | "autoAssess"
  | "assessment"
  | "stale"
  | "assessing"
  | "lastAssessFailure"
> & {
  runner: Pick<TaskAgent["runner"], "configured">;
  ship: Pick<TaskAgent["ship"], "blockers">;
};

/**
 * Opening a task asks for an assessment when there is none or it is out of
 * date: tasks created before the agent was turned on, and edits from
 * integrations, are not assessed automatically. Only projects that check
 * readiness automatically do this; the others check on request. Archived
 * tasks are skipped, as the server's automatic assessments skip them, and so
 * is a workspace without a runner to take the check. A check that failed for
 * the same text is not retried on its own: it would likely fail again.
 */
export function shouldAutoAssess(
  agent: AutoAssessInput,
  canUpdate: boolean,
): boolean {
  return (
    canUpdate &&
    agent.enabled &&
    agent.autoAssess &&
    agent.runner.configured &&
    !agent.assessing &&
    !agent.ship.blockers.includes("archived") &&
    !agent.lastAssessFailure?.sameInput &&
    (agent.assessment === null || agent.stale)
  );
}
