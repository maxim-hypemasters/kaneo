import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { HEARTBEAT_MS, TURN_WALL_CLOCK_MS } from "../constants";
import { fromHttpStatus } from "../openrouter/openrouter-error";
import type { AssistantStreamEvent } from "../stream-events";
import {
  type EmitEvent,
  streamTurn,
  type StreamTurnOptions,
} from "./stream-turn";

type Run = (emit: EmitEvent, signal: AbortSignal) => Promise<void>;

function serve(
  run: Run,
  options: StreamTurnOptions = {},
  app: Hono = new Hono(),
) {
  const log: string[] = [];
  let finallyCalls = 0;
  app.post("/", (c) =>
    streamTurn(
      c,
      run,
      async () => {
        finallyCalls += 1;
        log.push("finally");
      },
      options,
    ),
  );
  return {
    log,
    finallyCalls: () => finallyCalls,
    request: (init: RequestInit = {}) =>
      app.request("/", { method: "POST", ...init }),
  };
}

function untilAborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}

function parseEvents(text: string): AssistantStreamEvent[] {
  return text
    .split("\n\n")
    .filter((record) => record.startsWith("data: "))
    .map((record) => JSON.parse(record.slice("data: ".length)));
}

async function readAll(response: Response, log?: string[]) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const event of parseEvents(chunk)) log?.push(event.type);
    text += chunk;
  }
  return text;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("streamTurn", () => {
  it("streams events with SSE headers and ends with one terminal event after cleanup", async () => {
    const { request, log, finallyCalls } = serve(async (emit) => {
      await emit({ type: "delta", text: "Hel" });
      await emit({ type: "delta", text: "lo" });
      await emit({ type: "done", pendingCount: 0 });
      await emit({ type: "delta", text: "late" });
      await emit({
        type: "error",
        code: "ASSISTANT_INTERNAL",
        retryable: true,
      });
    });
    const response = await request();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(response.headers.get("cache-control")).toBe(
      "no-store, no-transform",
    );

    const text = await readAll(response, log);
    expect(parseEvents(text)).toEqual([
      { type: "delta", text: "Hel" },
      { type: "delta", text: "lo" },
      { type: "done", pendingCount: 0 },
    ]);
    // The browser sees `done` only once the chat was released.
    expect(log).toEqual(["delta", "delta", "finally", "done"]);
    expect(finallyCalls()).toBe(1);
  });

  it("keeps its headers when a middleware touched the response first", async () => {
    const app = new Hono();
    app.use(async (c, next) => {
      c.res.headers.set("X-Seen", "yes");
      await next();
    });
    const { request } = serve(
      async (emit) => {
        await emit({ type: "done", pendingCount: 0 });
      },
      {},
      app,
    );
    const response = await request();

    expect(response.headers.get("x-seen")).toBe("yes");
    expect(response.headers.get("cache-control")).toBe(
      "no-store, no-transform",
    );
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(parseEvents(await readAll(response))).toEqual([
      { type: "done", pendingCount: 0 },
    ]);
  });

  it("turns a thrown error into a sanitized internal error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { request, finallyCalls } = serve(async () => {
      throw new Error("Failed query: insert ... params: secret text");
    });
    const text = await readAll(await request());

    expect(parseEvents(text)).toEqual([
      { type: "error", code: "ASSISTANT_INTERNAL", retryable: true },
    ]);
    expect(text).not.toContain("secret");
    expect(finallyCalls()).toBe(1);
  });

  it("reports a thrown provider error by its code", async () => {
    const { request } = serve(async () => {
      throw fromHttpStatus(429);
    });
    expect(parseEvents(await readAll(await request()))).toEqual([
      { type: "error", code: "OPENROUTER_RATE_LIMITED", retryable: true },
    ]);
  });

  it("ends a turn that returned without a terminal event with an error", async () => {
    const { request } = serve(async (emit) => {
      await emit({ type: "delta", text: "x" });
    });
    expect(parseEvents(await readAll(await request()))).toEqual([
      { type: "delta", text: "x" },
      { type: "error", code: "ASSISTANT_INTERNAL", retryable: true },
    ]);
  });

  it("aborts the turn when the client goes away, and cleans up once", async () => {
    let signal: AbortSignal | undefined;
    const { request, finallyCalls } = serve(async (emit, turnSignal) => {
      signal = turnSignal;
      await emit({ type: "delta", text: "first" });
      await untilAborted(turnSignal);
      await emit({ type: "delta", text: "after abort" });
    });
    const response = await request();
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain("first");

    await reader.cancel();
    await vi.waitFor(() => expect(finallyCalls()).toBe(1));
    expect(signal?.aborted).toBe(true);
  });

  it("aborts the turn when the request signal aborts", async () => {
    const client = new AbortController();
    let signal: AbortSignal | undefined;
    const { request, finallyCalls } = serve(async (_emit, turnSignal) => {
      signal = turnSignal;
      await untilAborted(turnSignal);
    });
    await request({ signal: client.signal });
    client.abort();
    await vi.waitFor(() => expect(finallyCalls()).toBe(1));
    expect(signal?.aborted).toBe(true);
  });

  it("pings, renews the lease, and stops the turn when the lease is lost", async () => {
    vi.useFakeTimers();
    const renewals: boolean[] = [true, false];
    const { request } = serve(
      async (_emit, signal) => {
        await untilAborted(signal);
      },
      { onHeartbeat: async () => renewals.shift() ?? false },
    );
    const response = await request();
    const reading = readAll(response);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);
    const text = await reading;

    expect(text.match(/^: ping$/gm)).toHaveLength(2);
    expect(renewals).toEqual([]);
    expect(parseEvents(text)).toEqual([
      { type: "error", code: "ASSISTANT_INTERNAL", retryable: true },
    ]);
  });

  it("stops at the wall clock with a retryable step limit", async () => {
    vi.useFakeTimers();
    const { request } = serve(async (_emit, signal) => {
      await untilAborted(signal);
    });
    const response = await request();
    const reading = readAll(response);
    await vi.advanceTimersByTimeAsync(TURN_WALL_CLOCK_MS);
    expect(parseEvents(await reading)).toEqual([
      { type: "error", code: "ASSISTANT_STEP_LIMIT", retryable: true },
    ]);
  });
});
