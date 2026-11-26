import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { KaneoError } from "../kaneo/client";
import { fakeKaneo } from "../test-support/fixtures";
import { startRunSession } from "./run-session";

afterEach(() => vi.useRealTimers());

function session(heartbeat: () => Promise<{ cancelRequested: boolean }>) {
  const kaneo = fakeKaneo();
  const calls: unknown[] = [];
  kaneo.client.heartbeat = async (ref) => {
    calls.push(ref);
    return heartbeat();
  };
  const run = startRunSession(
    kaneo.client,
    { id: "run-1", attempt: 3 },
    {
      timeoutMs: 60 * 60_000,
      redact: (text) => text,
      shutdown: new AbortController().signal,
      log: () => {},
    },
  );
  return { run, calls };
}

describe("startRunSession", () => {
  it("heartbeats soon after the claim, naming its attempt", async () => {
    vi.useFakeTimers();
    const { run, calls } = session(async () => ({ cancelRequested: false }));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toEqual([{ id: "run-1", attempt: 3 }]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run.stopReason()).toBeNull();
    await run.end();
  });

  it("stops as lost when Kaneo refuses the token or the attempt", async () => {
    vi.useFakeTimers();
    for (const status of [401, 404, 409]) {
      const { run } = session(async () => {
        throw new KaneoError(status, "{}");
      });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(run.stopReason()).toBe("lost");
      expect(run.signal.aborted).toBe(true);
      await run.end();
    }
  });

  it("stops as lost when no heartbeat reached Kaneo for 90 seconds", async () => {
    vi.useFakeTimers();
    const { run } = session(async () => {
      throw new Error("fetch failed");
    });
    await vi.advanceTimersByTimeAsync(85_000);
    expect(run.stopReason()).toBeNull();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run.stopReason()).toBe("lost");
    await run.end();
  });

  it("stops as cancelled when Kaneo asks", async () => {
    vi.useFakeTimers();
    const { run } = session(async () => ({ cancelRequested: true }));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(run.stopReason()).toBe("cancelled");
    await run.end();
  });
});
