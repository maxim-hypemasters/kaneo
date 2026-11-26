import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createEventBuffer } from "./event-buffer";

afterEach(() => vi.useRealTimers());

describe("createEventBuffer", () => {
  it("batches, redacts and keeps the newest twenty", async () => {
    const sent: unknown[] = [];
    const buffer = createEventBuffer(async (events) => void sent.push(events), {
      intervalMs: 60_000,
      redact: (text) => text.replace("secret", "[redacted]"),
    });
    for (let i = 0; i < 25; i++) buffer.push("log", `line ${i}`);
    buffer.push("tool", "  uses   secret  ");
    buffer.push("log", "   ");
    await buffer.close();
    expect(sent).toHaveLength(1);
    const batch = sent[0] as Array<{ kind: string; message: string }>;
    expect(batch).toHaveLength(20);
    expect(batch.at(-1)).toEqual({ kind: "tool", message: "uses [redacted]" });
  });

  it("sends on its interval", async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => {});
    const buffer = createEventBuffer(send, {
      intervalMs: 1000,
      redact: (text) => text,
    });
    buffer.push("step", "Cloning");
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledWith([{ kind: "step", message: "Cloning" }]);
    await buffer.close();
  });
});
