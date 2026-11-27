import { describe, expect, it } from "vite-plus/test";
import type { AgentRun } from "@/fetchers/agent/get-task-agent";
import { startActionsMode } from "./start-actions-mode";

const ready = {
  score: 90,
  verdict: "ready" as const,
  questions: [],
  suggestions: [],
  assessedAt: "2026-11-26T10:00:00.000Z",
};
const blockingQuestion = {
  id: "q1",
  text: "Which format?",
  options: ["CSV"],
  blocking: true,
};
const activeRun: AgentRun = {
  id: "r1",
  kind: "start",
  status: "queued",
  requestedBy: null,
  cancelRequested: false,
  result: null,
  errorCode: null,
  error: null,
  createdAt: "2026-11-26T10:00:00.000Z",
  startedAt: null,
  finishedAt: null,
};
const agent = {
  assessment: ready,
  stale: false,
  start: {
    canStart: true,
    blockers: [],
    pullRequest: "opens" as const,
  },
  ship: { activeRun: null },
};
const base = { stage: "todo" as const, canUpdate: true, agent };

describe("startActionsMode", () => {
  it("leads with Ship when the current assessment is ready", () => {
    expect(startActionsMode(base)).toBe("ship");
  });

  it("offers Start at any other readiness", () => {
    expect(
      startActionsMode({ ...base, agent: { ...agent, assessment: null } }),
    ).toBe("start");
    expect(
      startActionsMode({
        ...base,
        agent: {
          ...agent,
          assessment: { ...ready, verdict: "needs_clarification" },
        },
      }),
    ).toBe("start");
    expect(
      startActionsMode({ ...base, agent: { ...agent, stale: true } }),
    ).toBe("start");
    expect(
      startActionsMode({
        ...base,
        agent: {
          ...agent,
          assessment: { ...ready, questions: [blockingQuestion] },
        },
      }),
    ).toBe("start");
  });

  it("keeps Ship's menu when only the runner or repository blocks Ship", () => {
    expect(
      startActionsMode({
        ...base,
        agent: {
          ...agent,
          start: { ...agent.start, pullRequest: "runner_missing" as const },
        },
      }),
    ).toBe("ship");
  });

  it("offers nothing outside To Do", () => {
    expect(startActionsMode({ ...base, stage: "triage" })).toBeNull();
    expect(startActionsMode({ ...base, stage: "other" })).toBeNull();
  });

  it("offers nothing without permission, during a run, or when Start is blocked", () => {
    expect(startActionsMode({ ...base, canUpdate: false })).toBeNull();
    expect(
      startActionsMode({ ...base, agent: { ...agent, ship: { activeRun } } }),
    ).toBeNull();
    expect(
      startActionsMode({
        ...base,
        agent: {
          ...agent,
          start: {
            ...agent.start,
            canStart: false,
            blockers: ["archived" as const],
          },
        },
      }),
    ).toBeNull();
  });
});
