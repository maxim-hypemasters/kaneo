import { describe, expect, it } from "vite-plus/test";
import { computeShipBlockers } from "./compute-ship-blockers";

const ready = {
  enabled: true,
  repository: "acme/app",
  hasRunner: true,
  archived: false,
  inTriage: false,
  assessment: { verdict: "ready" as const, questions: [], inputHash: "h1" },
  currentInputHash: "h1",
  shipInProgress: false,
};

describe("computeShipBlockers", () => {
  it("allows a ready, current assessment", () => {
    expect(computeShipBlockers(ready)).toEqual([]);
  });

  it("reports configuration gaps", () => {
    expect(
      computeShipBlockers({
        ...ready,
        enabled: false,
        repository: null,
        hasRunner: false,
      }),
    ).toEqual(["agent_disabled", "no_repository", "runner_missing"]);
  });

  it("blocks an unassessed, outdated or unready task", () => {
    expect(computeShipBlockers({ ...ready, assessment: null })).toEqual([
      "not_assessed",
    ]);
    expect(computeShipBlockers({ ...ready, currentInputHash: "h2" })).toEqual([
      "assessment_outdated",
    ]);
    expect(
      computeShipBlockers({
        ...ready,
        assessment: { ...ready.assessment, verdict: "not_ready" },
      }),
    ).toEqual(["not_ready"]);
  });

  it("names open blocking questions instead of the verdict", () => {
    expect(
      computeShipBlockers({
        ...ready,
        assessment: {
          verdict: "needs_clarification",
          questions: [{ blocking: true }],
          inputHash: "h1",
        },
      }),
    ).toEqual(["open_questions"]);
  });

  it("blocks work still waiting in Triage", () => {
    expect(computeShipBlockers({ ...ready, inTriage: true })).toEqual([
      "in_triage",
    ]);
  });

  it("blocks a second Ship and an archived task", () => {
    expect(
      computeShipBlockers({ ...ready, shipInProgress: true, archived: true }),
    ).toEqual(["archived", "ship_in_progress"]);
  });
});
