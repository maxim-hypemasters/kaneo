import { describe, expect, it } from "vite-plus/test";
import { shouldAutoAssess } from "./should-auto-assess";

const assessment = {
  score: 80,
  verdict: "ready" as const,
  summary: "",
  checklist: [],
  questions: [],
  suggestions: [],
  assessedAt: "2026-11-26T10:00:00.000Z",
};
const base = {
  enabled: true,
  autoAssess: true,
  assessment,
  stale: false,
  assessing: false,
  lastAssessFailure: null,
  runner: { configured: true },
  ship: { blockers: [] },
};

describe("shouldAutoAssess", () => {
  it("asks when the task was never assessed or changed since", () => {
    expect(shouldAutoAssess({ ...base, assessment: null }, true)).toBe(true);
    expect(shouldAutoAssess({ ...base, stale: true }, true)).toBe(true);
  });

  it("leaves a current assessment alone", () => {
    expect(shouldAutoAssess(base, true)).toBe(false);
  });

  it("checks only on request when the project turned automatic checks off", () => {
    expect(
      shouldAutoAssess({ ...base, assessment: null, autoAssess: false }, true),
    ).toBe(false);
    expect(
      shouldAutoAssess({ ...base, stale: true, autoAssess: false }, true),
    ).toBe(false);
  });

  it("waits for a runner to take the check", () => {
    expect(
      shouldAutoAssess(
        { ...base, assessment: null, runner: { configured: false } },
        true,
      ),
    ).toBe(false);
  });

  it("waits while an assessment is already queued or running", () => {
    expect(
      shouldAutoAssess({ ...base, assessment: null, assessing: true }, true),
    ).toBe(false);
  });

  it("skips archived tasks", () => {
    expect(
      shouldAutoAssess(
        { ...base, assessment: null, ship: { blockers: ["archived"] } },
        true,
      ),
    ).toBe(false);
  });

  it("needs the agent on and permission to update the task", () => {
    expect(shouldAutoAssess({ ...base, assessment: null }, false)).toBe(false);
    expect(
      shouldAutoAssess({ ...base, assessment: null, enabled: false }, true),
    ).toBe(false);
  });

  it("does not retry a check that failed for the same text", () => {
    const failure = {
      code: "agent_failed",
      message: "Hermes failed",
      at: "2026-11-26T10:00:00.000Z",
    };
    expect(
      shouldAutoAssess(
        {
          ...base,
          assessment: null,
          lastAssessFailure: { ...failure, sameInput: true },
        },
        true,
      ),
    ).toBe(false);
    expect(
      shouldAutoAssess(
        {
          ...base,
          assessment: null,
          lastAssessFailure: { ...failure, sameInput: false },
        },
        true,
      ),
    ).toBe(true);
  });
});
