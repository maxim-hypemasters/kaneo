import { describe, expect, it } from "vite-plus/test";
import { KaneoError, type RunClaim } from "../kaneo/client";
import { claimFor, fakeKaneo } from "../test-support/fixtures";
import { pollLoop } from "./poll-loop";

// Answers each claim with the next reply, then stops the loop.
function scriptedLoop(
  replies: Array<RunClaim | Error | null>,
  refusedNote?: string,
) {
  const shutdown = new AbortController();
  const kaneo = fakeKaneo().client;
  const asked: unknown[] = [];
  kaneo.claim = async (kinds) => {
    asked.push(kinds);
    const reply = replies.shift();
    if (!replies.length) shutdown.abort();
    if (reply instanceof Error) throw reply;
    return reply ?? null;
  };
  const logs: string[] = [];
  const handled: string[] = [];
  const done = pollLoop({
    kaneo,
    kinds: ["start"],
    intervalMs: 1,
    shutdown: shutdown.signal,
    log: (message) => logs.push(message),
    handle: async (claim) => void handled.push(claim.run.id),
    refusedNote,
  });
  return { done, logs, handled, asked };
}

const refused = () => new KaneoError(400, '{"success":false}');

describe("pollLoop", () => {
  it("logs an older Kaneo's refusal once while it lasts, and again after a claim got through", async () => {
    const loop = scriptedLoop(
      [refused(), refused(), refused(), null, refused(), refused()],
      "Kaneo doesn't hand out start runs",
    );
    await loop.done;
    expect(loop.asked).toHaveLength(6);
    expect(loop.logs).toEqual([
      "Kaneo doesn't hand out start runs",
      "Kaneo doesn't hand out start runs",
    ]);
  });

  it("logs every other claim failure, and every refusal without a note", async () => {
    const loop = scriptedLoop([
      refused(),
      new KaneoError(500, "down"),
      refused(),
    ]);
    await loop.done;
    expect(loop.logs).toEqual([
      'Claim failed: Kaneo answered 400: {"success":false}',
      "Claim failed: Kaneo answered 500: down",
      'Claim failed: Kaneo answered 400: {"success":false}',
    ]);
  });

  it("handles what it claims", async () => {
    const loop = scriptedLoop([claimFor("start"), null]);
    await loop.done;
    expect(loop.handled).toEqual(["run-start"]);
    expect(loop.asked).toEqual([["start"], ["start"]]);
  });
});
