import { describe, expect, it } from "vite-plus/test";
import { listedShipBlockers, shipBlockerKey } from "./ship-blocker-key";

describe("shipBlockerKey", () => {
  it("maps each blocker to its explanation", () => {
    expect(shipBlockerKey("no_repository")).toBe(
      "tasks:aiAgent.blockers.noRepository",
    );
    expect(shipBlockerKey("open_questions")).toBe(
      "tasks:aiAgent.blockers.openQuestions",
    );
  });
});

describe("listedShipBlockers", () => {
  it("leaves out what the run status and readiness bar show, keeping the order", () => {
    expect(
      listedShipBlockers([
        "no_repository",
        "runner_missing",
        "ship_in_progress",
        "not_ready",
      ]),
    ).toEqual(["no_repository", "not_ready"]);
  });
});
