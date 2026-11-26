import type { ProgressEvent } from "../kaneo/client";

const MAX_BATCH = 20;
const MAX_MESSAGE = 2000;

/**
 * Collects progress lines and sends them in batches, so a busy run makes one
 * request every few seconds rather than one per tool call.
 */
export function createEventBuffer(
  send: (events: ProgressEvent[]) => Promise<void>,
  options: { intervalMs: number; redact: (text: string) => string },
) {
  let queue: ProgressEvent[] = [];
  let sending: Promise<void> = Promise.resolve();

  const flush = () => {
    if (!queue.length) return sending;
    const batch = queue.slice(-MAX_BATCH);
    queue = [];
    sending = sending.then(() => send(batch)).catch(() => {});
    return sending;
  };
  const timer = setInterval(() => void flush(), options.intervalMs);
  timer.unref();

  return {
    push(kind: ProgressEvent["kind"], message: string) {
      const text = options.redact(message).replace(/\s+/g, " ").trim();
      if (text) queue.push({ kind, message: text.slice(0, MAX_MESSAGE) });
    },
    flush,
    async close() {
      clearInterval(timer);
      await flush();
    },
  };
}

export type EventBuffer = ReturnType<typeof createEventBuffer>;
