import type { TaskAgent } from "@/fetchers/agent/get-task-agent";

/**
 * What the readiness bar says about checking the task:
 * - `runnerMissing`: no runner exists, so nothing queued will start.
 * - `scheduled`: a check queued after recent edits waits out their window;
 *   asking now starts it early.
 * - `assessing`: a check is due or running.
 * - `idle`: no check is waiting.
 */
export type AssessState = "runnerMissing" | "scheduled" | "assessing" | "idle";

export function assessState(
  agent: Pick<TaskAgent, "assessing"> & {
    runner: Pick<TaskAgent["runner"], "configured">;
  },
  scheduled: boolean,
): AssessState {
  if (!agent.runner.configured) return "runnerMissing";
  if (!agent.assessing) return "idle";
  return scheduled ? "scheduled" : "assessing";
}
