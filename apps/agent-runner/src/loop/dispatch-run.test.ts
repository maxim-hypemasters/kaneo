import { describe, expect, it } from "vite-plus/test";
import type { RunClaim } from "../kaneo/client";
import type { RunDeps } from "../run-deps";
import {
  claimFor,
  fakeKaneo,
  tempDir,
  testConfig,
} from "../test-support/fixtures";
import { dispatchRun, type RunHandler } from "./dispatch-run";

async function setup() {
  const kaneo = fakeKaneo();
  const deps: RunDeps = {
    config: testConfig(await tempDir(), {}),
    kaneo: kaneo.client,
    redact: (text) => text,
    github: async () => null,
    shutdown: new AbortController().signal,
    log: () => {},
  };
  const ran: string[] = [];
  const handler =
    (name: string): RunHandler =>
    async (_deps, claim) =>
      void ran.push(`${name}:${claim.run.id}`);
  const handlers = {
    assess: handler("assess"),
    ship: handler("ship"),
    start: handler("start"),
  };
  return { deps, kaneo, ran, handlers };
}

describe("dispatchRun", () => {
  it("runs each claim by the kind Kaneo gave it", async () => {
    const { deps, kaneo, ran, handlers } = await setup();
    for (const kind of ["start", "assess", "ship"] as const)
      await dispatchRun(handlers, deps, claimFor(kind));
    expect(ran).toEqual([
      "start:run-start",
      "assess:run-assess",
      "ship:run-ship",
    ]);
    expect(kaneo.calls).toEqual([]);
  });

  it("fails a run of a kind the slot doesn't take, or doesn't know", async () => {
    const { deps, kaneo, ran, handlers } = await setup();
    const review: RunClaim = {
      ...claimFor("ship"),
      run: { id: "run-review", kind: "review" as never, attempt: 1 },
    };
    await dispatchRun({ start: handlers.start }, deps, claimFor("assess"));
    await dispatchRun(handlers, deps, review);

    expect(ran).toEqual([]);
    expect(kaneo.calls).toEqual([
      [
        "fail",
        "run-assess",
        {
          code: "internal",
          message: "This runner can't take assess runs",
        },
      ],
      [
        "fail",
        "run-review",
        {
          code: "internal",
          message: "This runner can't take review runs",
        },
      ],
    ]);
  });
});
