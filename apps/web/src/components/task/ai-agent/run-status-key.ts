import type { AgentRun } from "@/fetchers/agent/get-task-agent";

const RUN_STATUS_KEYS: Record<
  AgentRun["kind"],
  Record<AgentRun["status"], string>
> = {
  ship: {
    queued: "tasks:aiAgent.run.queued",
    running: "tasks:aiAgent.run.working",
    succeeded: "tasks:aiAgent.run.succeeded",
    failed: "tasks:aiAgent.run.failed",
    cancelled: "tasks:aiAgent.run.cancelled",
  },
  start: {
    queued: "tasks:aiAgent.run.startQueued",
    running: "tasks:aiAgent.run.starting",
    succeeded: "tasks:aiAgent.run.startSucceeded",
    failed: "tasks:aiAgent.run.startFailed",
    cancelled: "tasks:aiAgent.run.startCancelled",
  },
};

/** What the run status says: Ship runs Hermes, Start only opens a draft PR. */
export function runStatusKey(run: Pick<AgentRun, "kind" | "status">): string {
  return RUN_STATUS_KEYS[run.kind][run.status];
}
