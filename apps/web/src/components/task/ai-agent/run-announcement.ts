import type { TaskAgent } from "@/fetchers/agent/get-task-agent";
import { runStatusKey } from "./run-status-key";

export type RunAnnouncement = { key: string } | { text: string } | null;

/**
 * What screen readers hear about the Ship or Start run: its state, and while
 * it runs the latest step it reported. Tool calls and log lines stay in the
 * log, which people read when they choose to.
 */
export function runAnnouncement(
  ship: Pick<TaskAgent["ship"], "activeRun" | "lastRun" | "events">,
): RunAnnouncement {
  const { activeRun, lastRun, events } = ship;
  if (activeRun) {
    if (activeRun.status === "queued") return { key: runStatusKey(activeRun) };
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event.kind === "step") return { text: event.message };
    }
    return { key: runStatusKey(activeRun) };
  }
  return lastRun ? { key: runStatusKey(lastRun) } : null;
}
