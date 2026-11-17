import { OpenRouterError } from "./openrouter-error";

const LINE_BREAK = /\r\n|\r|\n/;
const DONE = "[DONE]";

/**
 * Yields the `data` payload of each server-sent event, with multi-line data
 * joined by "\n". Comment lines (":") such as OpenRouter's keep-alives, other
 * fields and empty payloads are skipped. Reading stops at `data: [DONE]`; an
 * event the stream cuts off before its blank line is dropped, as the SSE
 * spec requires. More than `maxBytes` is OPENROUTER_UNAVAILABLE.
 *
 * The body is cancelled whenever iteration ends, so breaking out early or
 * throwing from the loop also closes the upstream connection.
 */
export async function* readSseData(
  body: ReadableStream<Uint8Array>,
  limits: { maxBytes: number },
): AsyncGenerator<string> {
  const reader = body.getReader();
  // Streaming decode keeps a multi-byte character split across chunks whole.
  const decoder = new TextDecoder();
  let pending = "";
  let data: string[] = [];
  let size = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      size += value.byteLength;
      if (size > limits.maxBytes) {
        throw new OpenRouterError("OPENROUTER_UNAVAILABLE");
      }

      const text = pending + decoder.decode(value, { stream: true });
      // A trailing "\r" may be the first half of "\r\n", so it waits for the
      // next chunk rather than ending a line (and an event) too early.
      const heldReturn = text.endsWith("\r");
      const lines = (heldReturn ? text.slice(0, -1) : text).split(LINE_BREAK);
      pending = (lines.pop() ?? "") + (heldReturn ? "\r" : "");

      for (const line of lines) {
        if (line === "") {
          const payload = data.join("\n");
          data = [];
          if (payload.trim() === DONE) return;
          if (payload.trim() !== "") yield payload;
          continue;
        }
        if (line.startsWith(":")) continue;

        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        if (field !== "data") continue;
        const value = colon === -1 ? "" : line.slice(colon + 1);
        data.push(value.startsWith(" ") ? value.slice(1) : value);
      }
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
