import { describe, expect, it } from "vite-plus/test";
import type { AgentRun, AgentRunEvent } from "@/fetchers/agent/get-task-agent";
import { runAnnouncement } from "./run-announcement";

function run(
  status: AgentRun["status"],
  kind: AgentRun["kind"] = "ship",
): AgentRun {
  return {
    id: "r1",
    kind,
    status,
    requestedBy: null,
    cancelRequested: false,
    result: null,
    errorCode: null,
    error: null,
    createdAt: "2026-11-26T10:00:00.000Z",
    startedAt: null,
    finishedAt: null,
  };
}

function event(id: number, kind: AgentRunEvent["kind"], message: string) {
  return { id, kind, message, createdAt: "2026-11-26T10:00:00.000Z" };
}

describe("runAnnouncement", () => {
  it("says nothing before the task was ever shipped", () => {
    expect(
      runAnnouncement({ activeRun: null, lastRun: null, events: [] }),
    ).toBeNull();
  });

  it("announces a queued run, then the latest step while it runs", () => {
    expect(
      runAnnouncement({ activeRun: run("queued"), lastRun: null, events: [] }),
    ).toEqual({ key: "tasks:aiAgent.run.queued" });
    expect(
      runAnnouncement({ activeRun: run("running"), lastRun: null, events: [] }),
    ).toEqual({ key: "tasks:aiAgent.run.working" });
    expect(
      runAnnouncement({
        activeRun: run("running"),
        lastRun: null,
        events: [
          event(1, "step", "Reading the task"),
          event(2, "step", "Running the tests"),
          event(3, "tool", "terminal: pnpm test"),
          event(4, "log", "2 tests failed"),
        ],
      }),
    ).toEqual({ text: "Running the tests" });
  });

  it("announces how the last run ended", () => {
    for (const status of ["succeeded", "failed", "cancelled"] as const) {
      expect(
        runAnnouncement({ activeRun: null, lastRun: run(status), events: [] }),
      ).toEqual({ key: `tasks:aiAgent.run.${status}` });
    }
  });

  it("speaks of the draft pull request for a Start run", () => {
    expect(
      runAnnouncement({
        activeRun: run("queued", "start"),
        lastRun: null,
        events: [],
      }),
    ).toEqual({ key: "tasks:aiAgent.run.startQueued" });
    expect(
      runAnnouncement({
        activeRun: null,
        lastRun: run("succeeded", "start"),
        events: [],
      }),
    ).toEqual({ key: "tasks:aiAgent.run.startSucceeded" });
  });
});
