import type { TaskAgent } from "@/fetchers/agent/get-task-agent";
import type { TaskStage } from "./task-stage";

/**
 * Which start actions the readiness card offers:
 * - `ship`: Hermes judged the current task ready, so Ship with AI leads,
 *   with Start task and Copy prompt in its menu. The menu works even when
 *   Ship itself is blocked, for example without a runner.
 * - `start`: Start task alone, at any other readiness.
 * - `null`: none, outside To Do, without permission to update the task, or
 *   while a run is active.
 */
export type StartActionsMode = "ship" | "start" | null;

type StartActionsInput = {
  stage: TaskStage;
  canUpdate: boolean;
  agent: Pick<TaskAgent, "assessment" | "stale" | "start"> & {
    ship: Pick<TaskAgent["ship"], "activeRun">;
  };
};

export function startActionsMode({
  stage,
  canUpdate,
  agent,
}: StartActionsInput): StartActionsMode {
  if (stage !== "todo" || !canUpdate) return null;
  if (agent.ship.activeRun || !agent.start.canStart) return null;
  const { assessment } = agent;
  const ready =
    assessment !== null &&
    assessment.verdict === "ready" &&
    !agent.stale &&
    !assessment.questions.some((question) => question.blocking);
  return ready ? "ship" : "start";
}
