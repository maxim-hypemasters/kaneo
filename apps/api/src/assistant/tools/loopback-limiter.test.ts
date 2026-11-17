import { describe, expect, it } from "vite-plus/test";
import { createLimiter } from "./loopback-limiter";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("createLimiter", () => {
  it("runs at most `max` calls at once, in arrival order", async () => {
    const limiter = createLimiter(2);
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const started: number[] = [];
    let active = 0;
    let peak = 0;

    const runs = gates.map((gate, index) =>
      limiter.run(async () => {
        started.push(index);
        active++;
        peak = Math.max(peak, active);
        await gate.promise;
        active--;
        return index;
      }),
    );

    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    gates[1]?.resolve();
    await runs[1];
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);
    for (const gate of gates) gate.resolve();
    expect(await Promise.all(runs)).toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
  });

  it("frees the slot when a call fails", async () => {
    const limiter = createLimiter(1);
    await expect(
      limiter.run(() => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    expect(await limiter.run(async () => "next")).toBe("next");
  });
});
