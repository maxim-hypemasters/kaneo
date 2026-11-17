import { describe, expect, it } from "vite-plus/test";
import { readSseEvents, type SseEvent } from "./read-sse-events";

function streamOf(chunks: Array<string | Uint8Array>) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          typeof chunk === "string" ? encoder.encode(chunk) : chunk,
        );
      }
      controller.close();
    },
  });
}

async function collect(chunks: Array<string | Uint8Array>) {
  const events: SseEvent[] = [];
  for await (const event of readSseEvents(streamOf(chunks))) {
    events.push(event);
  }
  return events;
}

const data = (...values: string[]) =>
  values.map((value) => ({ event: "message", data: value }));

describe("readSseEvents", () => {
  it("reads data events separated by blank lines", async () => {
    expect(await collect(['data: {"a":1}\n\ndata: {"b":2}\n\n'])).toEqual(
      data('{"a":1}', '{"b":2}'),
    );
  });

  it("accepts CRLF and CR line endings", async () => {
    expect(
      await collect(["data: one\r\n\r\ndata: two\r\rdata: three\n\n"]),
    ).toEqual(data("one", "two", "three"));
  });

  it("joins events split across chunks, including a CRLF split in two", async () => {
    expect(
      await collect(["da", "ta: hel", "lo\r", "\n", "\r", "\ndata: x\n", "\n"]),
    ).toEqual(data("hello", "x"));
  });

  it("decodes multi-byte characters split across chunks", async () => {
    const bytes = new TextEncoder().encode("data: café ✓\n\n");
    expect(
      await collect([bytes.slice(0, 10), bytes.slice(10, 13), bytes.slice(13)]),
    ).toEqual(data("café ✓"));
  });

  it("skips comments such as keep-alive pings", async () => {
    expect(
      await collect([": ping\n\ndata: a\n: inside\n\n:\n\n", ": ping\n\n"]),
    ).toEqual(data("a"));
  });

  it("joins multi-line data with newlines and keeps a missing space", async () => {
    expect(await collect(["data: first\ndata:second\ndata\n\n"])).toEqual(
      data("first\nsecond\n"),
    );
  });

  it("reports the event field and ignores unknown fields", async () => {
    expect(
      await collect(["event: update\nid: 7\nretry: 10\ndata: x\n\n"]),
    ).toEqual([{ event: "update", data: "x" }]);
  });

  it("dispatches nothing for a blank line without data", async () => {
    expect(await collect(["\n\nevent: lonely\n\n"])).toEqual([]);
  });

  it("drops an event the stream cuts off before its blank line", async () => {
    expect(await collect(["data: kept\n\ndata: cut off\n"])).toEqual(
      data("kept"),
    );
    expect(await collect(["data: no newline at all"])).toEqual([]);
  });

  it("ends cleanly on an empty stream", async () => {
    expect(await collect([])).toEqual([]);
  });
});
