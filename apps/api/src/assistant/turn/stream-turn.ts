import * as Sentry from "@sentry/node";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { HEARTBEAT_MS, TURN_WALL_CLOCK_MS } from "../constants";
import type { AssistantStreamEvent } from "../stream-events";
import {
  INTERNAL_FAILURE,
  providerFailure,
  type StreamFailure,
} from "./stream-error";

/** Sends one event to the browser. Never rejects. */
export type EmitEvent = (event: AssistantStreamEvent) => Promise<void>;

export type StreamTurnOptions = {
  /** Runs with every heartbeat; resolving false (lease lost) stops the turn. */
  onHeartbeat?: () => Promise<boolean>;
};

type StopReason = "client" | "timeout" | "lease";

// No proxy buffering (nginx) and no compression or caching on the way.
const STREAM_HEADERS = [
  ["X-Accel-Buffering", "no"],
  ["Cache-Control", "no-store, no-transform"],
] as const;

// After the wall clock, a client that stopped reading gets one more
// heartbeat before writes are dropped, so a stalled reader can't hold the
// turn (and its lease and slot) open.
const WRITE_GRACE_MS = HEARTBEAT_MS;

function stopFailure(reason: StopReason | null): StreamFailure {
  // Out of time is a step limit: Continue picks the turn up again.
  return reason === "timeout"
    ? { code: "ASSISTANT_STEP_LIMIT", retryable: true }
    : INTERNAL_FAILURE;
}

// Error messages can hold SQL parameters, so only the error's kind is logged
// and reported: never message content.
function reportFailure(userId: string | undefined, error: unknown) {
  const name = error instanceof Error ? error.name : typeof error;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : undefined;
  console.error("Assistant turn failed:", name, code ?? "");
  Sentry.captureMessage("Assistant turn failed", {
    level: "error",
    tags: { area: "assistant", code: "ASSISTANT_INTERNAL", error: name },
    user: userId ? { id: userId } : undefined,
  });
}

/**
 * Streams one assistant turn as SSE: `data:` JSON events, a `: ping`
 * heartbeat, and exactly one terminal `done` or `error` event, written
 * after `onFinally` so the chat is free again when the browser sees it.
 *
 * `run` gets an `emit` that never throws and a signal that aborts when the
 * client goes away, the lease is lost, or the wall clock runs out. Whatever
 * `run` throws becomes a sanitized `error` event; `onFinally` runs exactly
 * once. No onError is passed to streamSSE: it would write `e.message`.
 */
export function streamTurn(
  c: Context,
  run: (emit: EmitEvent, signal: AbortSignal) => Promise<void>,
  onFinally: () => void | Promise<void>,
  options: StreamTurnOptions = {},
): Response {
  const response = streamSSE(c, async (stream) => {
    const controller = new AbortController();
    let stopReason: StopReason | null = null;
    const stop = (reason: StopReason) => {
      if (stopReason !== null) return;
      stopReason = reason;
      controller.abort(
        new DOMException(`Turn stopped: ${reason}`, "AbortError"),
      );
    };

    // Writes are serialized, and resolve early once nobody reads them.
    let closed = false;
    let closeWrites = () => {};
    const writesClosed = new Promise<void>((resolve) => {
      closeWrites = resolve;
    });
    const close = () => {
      closed = true;
      closeWrites();
    };
    let queue: Promise<unknown> = Promise.resolve();
    const write = (send: () => Promise<unknown>): Promise<void> => {
      if (closed) return Promise.resolve();
      queue = queue.then(send).catch(() => {});
      return Promise.race([queue, writesClosed]).then(() => {});
    };
    const writeEvent = (event: AssistantStreamEvent) =>
      write(() => stream.writeSSE({ data: JSON.stringify(event) }));

    const requestSignal = c.req.raw.signal;
    const onClientGone = () => {
      stop("client");
      close();
    };
    stream.onAbort(onClientGone);
    if (requestSignal.aborted) onClientGone();
    else requestSignal.addEventListener("abort", onClientGone, { once: true });

    let terminal: AssistantStreamEvent | null = null;
    const emit: EmitEvent = (event) => {
      if (terminal) return Promise.resolve();
      if (event.type === "done" || event.type === "error") {
        terminal = event;
        return Promise.resolve();
      }
      return writeEvent(event);
    };

    const wallClock = setTimeout(() => stop("timeout"), TURN_WALL_CLOCK_MS);
    const writeDeadline = setTimeout(
      close,
      TURN_WALL_CLOCK_MS + WRITE_GRACE_MS,
    );
    const heartbeat = setInterval(() => {
      void write(() => stream.write(": ping\n\n"));
      options.onHeartbeat?.().then(
        (held) => {
          if (!held) stop("lease");
        },
        () => {},
      );
    }, HEARTBEAT_MS);

    let failure: StreamFailure | null = null;
    try {
      await run(emit, controller.signal);
    } catch (error) {
      failure = providerFailure(error);
      if (!failure) {
        failure = INTERNAL_FAILURE;
        reportFailure(c.get("userId"), error);
      }
    } finally {
      clearInterval(heartbeat);
      clearTimeout(wallClock);
      requestSignal.removeEventListener("abort", onClientGone);
      try {
        await onFinally();
      } catch (error) {
        reportFailure(c.get("userId"), error);
      }
      const last: AssistantStreamEvent = terminal ?? {
        type: "error",
        ...(failure ?? stopFailure(stopReason)),
      };
      await writeEvent(last);
      clearTimeout(writeDeadline);
    }
  });
  // streamSSE sets Cache-Control: no-cache through the context. Once any
  // middleware has touched c.res, Hono merges the context's headers over the
  // returned response, so both must carry the stream's headers.
  for (const [name, value] of STREAM_HEADERS) {
    c.header(name, value);
    response.headers.set(name, value);
  }
  return response;
}
