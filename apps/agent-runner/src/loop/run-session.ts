import { KaneoError, type KaneoClient, type RunRef } from "../kaneo/client";
import type { Redact } from "../redact";
import { createEventBuffer } from "./event-buffer";

const FIRST_HEARTBEAT_MS = 2_000;
const HEARTBEAT_MS = 30_000;
// Kaneo lets another runner claim a run 120 s after its last heartbeat.
// Stopping at 90 s leaves time to kill Hermes before that.
const LEASE_MS = 90_000;
const LEASE_CHECK_MS = 5_000;
const EVENT_INTERVAL_MS = 3_000;

export type StopReason = "cancelled" | "timeout" | "lost";

function lostReason(error: unknown): string | null {
  if (!(error instanceof KaneoError)) return null;
  if (error.status === 401)
    return "Kaneo refused the runner token (replaced or revoked)";
  if (error.status === 404 || error.status === 409)
    return "the run is no longer this runner's";
  return null;
}

/**
 * Keeps a claimed run alive: heartbeats, batched progress, and one abort
 * signal for cancellation from Kaneo, the timeout, or a lost claim. A claim
 * is lost when Kaneo refuses the heartbeat, or when none has reached it for
 * long enough that another runner may take the run over.
 */
export function startRunSession(
  kaneo: KaneoClient,
  run: RunRef,
  options: {
    timeoutMs: number;
    redact: Redact;
    shutdown: AbortSignal;
    log: (message: string) => void;
  },
) {
  const controller = new AbortController();
  let stopReason: StopReason | null = null;
  const stop = (reason: StopReason, why?: string) => {
    if (stopReason) return;
    stopReason = reason;
    if (why) options.log(`Stopping run ${run.id}: ${why}`);
    controller.abort();
  };

  // On shutdown the run is left to its lease: another poll takes it over.
  const onShutdown = () => stop("lost");
  options.shutdown.addEventListener("abort", onShutdown, { once: true });

  // The claim started the lease.
  let lastBeat = Date.now();
  let beating = false;
  const beat = async () => {
    if (beating || stopReason) return;
    beating = true;
    try {
      const { cancelRequested } = await kaneo.heartbeat(run);
      lastBeat = Date.now();
      if (cancelRequested) stop("cancelled");
    } catch (error) {
      const why = lostReason(error);
      if (why) stop("lost", why);
    } finally {
      beating = false;
    }
  };
  const timers = [
    setTimeout(beat, FIRST_HEARTBEAT_MS),
    setInterval(beat, HEARTBEAT_MS),
    setInterval(() => {
      if (Date.now() - lastBeat >= LEASE_MS)
        stop("lost", `no heartbeat reached Kaneo for ${LEASE_MS / 1000}s`);
    }, LEASE_CHECK_MS),
    setTimeout(() => stop("timeout"), options.timeoutMs),
  ];
  for (const timer of timers) timer.unref();

  const events = createEventBuffer((batch) => kaneo.events(run, batch), {
    intervalMs: EVENT_INTERVAL_MS,
    redact: options.redact,
  });

  return {
    signal: controller.signal,
    events,
    stopReason: () => stopReason,
    async end() {
      for (const timer of timers) clearTimeout(timer);
      options.shutdown.removeEventListener("abort", onShutdown);
      await events.close();
    },
  };
}

export type RunSession = ReturnType<typeof startRunSession>;
