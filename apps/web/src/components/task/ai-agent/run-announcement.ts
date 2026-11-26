import type { TaskAgent } from "@/fetchers/agent/get-task-agent";

export type RunAnnouncement = { key: string } | { text: string } | null;

const FINISHED_KEYS: Record<string, string> = {
  succeeded: "tasks:aiAgent.run.succeeded",
  failed: "tasks:aiAgent.run.failed",
  cancelled: "tasks:aiAgent.run.cancelled",
};

/**
 * What screen readers hear about the Ship run: its state, and while it runs
 * the latest step Hermes reported. Tool calls and log lines stay in the log,
 * which people read when they choose to.
 */
export function runAnnouncement(
  ship: Pick<TaskAgent["ship"], "activeRun" | "lastRun" | "events">,
): RunAnnouncement {
  const { activeRun, lastRun, events } = ship;
  if (activeRun) {
    if (activeRun.status === "queued")
      return { key: "tasks:aiAgent.run.queued" };
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event.kind === "step") return { text: event.message };
    }
    return { key: "tasks:aiAgent.run.working" };
  }
  const key = lastRun ? FINISHED_KEYS[lastRun.status] : undefined;
  return key ? { key } : null;
}
