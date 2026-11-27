import { describe, expect, it } from "vite-plus/test";
import { runStatusKey } from "./run-status-key";

describe("runStatusKey", () => {
  it("speaks of Hermes for a Ship run", () => {
    expect(runStatusKey({ kind: "ship", status: "queued" })).toBe(
      "tasks:aiAgent.run.queued",
    );
    expect(runStatusKey({ kind: "ship", status: "running" })).toBe(
      "tasks:aiAgent.run.working",
    );
    expect(runStatusKey({ kind: "ship", status: "succeeded" })).toBe(
      "tasks:aiAgent.run.succeeded",
    );
  });

  it("speaks of the draft pull request for a Start run", () => {
    expect(runStatusKey({ kind: "start", status: "queued" })).toBe(
      "tasks:aiAgent.run.startQueued",
    );
    expect(runStatusKey({ kind: "start", status: "running" })).toBe(
      "tasks:aiAgent.run.starting",
    );
    expect(runStatusKey({ kind: "start", status: "succeeded" })).toBe(
      "tasks:aiAgent.run.startSucceeded",
    );
    expect(runStatusKey({ kind: "start", status: "failed" })).toBe(
      "tasks:aiAgent.run.startFailed",
    );
    expect(runStatusKey({ kind: "start", status: "cancelled" })).toBe(
      "tasks:aiAgent.run.startCancelled",
    );
  });
});
