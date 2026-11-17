export type SseEvent = {
  /** The `event:` field, or "message" when the event has none. */
  event: string;
  /** The `data:` lines joined with newlines. */
  data: string;
};

/**
 * Parses a Server-Sent Events byte stream into its events, following the
 * EventSource rules: lines end in LF, CRLF or CR (a CRLF split across chunks
 * counts once), `:` lines are comments, multi-line `data` joins with "\n",
 * and an event is dispatched at a blank line. An event the stream cuts off
 * before its blank line is dropped, as EventSource does.
 */
export async function* readSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // A chunk ended in CR, so an LF opening the next chunk ends no line.
  let skipLeadingLf = false;
  let eventType = "";
  let dataLines: string[] | null = null;

  function* takeLine(line: string): Generator<SseEvent> {
    if (line === "") {
      if (dataLines !== null) {
        yield { event: eventType || "message", data: dataLines.join("\n") };
      }
      eventType = "";
      dataLines = null;
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") (dataLines ??= []).push(value);
    else if (field === "event") eventType = value;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (skipLeadingLf && buffer.startsWith("\n")) buffer = buffer.slice(1);
      skipLeadingLf = false;

      let start = 0;
      for (let index = 0; index < buffer.length; index++) {
        const char = buffer[index];
        if (char !== "\n" && char !== "\r") continue;
        yield* takeLine(buffer.slice(start, index));
        if (char === "\r") {
          if (index + 1 === buffer.length) skipLeadingLf = true;
          else if (buffer[index + 1] === "\n") index++;
        }
        start = index + 1;
      }
      buffer = buffer.slice(start);
    }
  } finally {
    reader.releaseLock();
  }
}
