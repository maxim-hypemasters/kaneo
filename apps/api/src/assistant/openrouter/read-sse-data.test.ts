import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { readSseData } from "./read-sse-data";

const FIXTURE = readFileSync(
  new URL(
    "../../../../../tests/api/assistant/fixtures/sonnet-5.5-parallel-tool-calls.sse",
    import.meta.url,
  ),
);
const LIMITS = { maxBytes: 4 * 1024 * 1024 };
const encoder = new TextEncoder();

function streamOf(parts: (string | Uint8Array)[]) {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(
          typeof part === "string" ? encoder.encode(part) : part,
        );
      }
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return { body, wasCancelled: () => cancelled };
}

async function collect(
  parts: (string | Uint8Array)[],
  limits = LIMITS,
): Promise<string[]> {
  const payloads: string[] = [];
  for await (const data of readSseData(streamOf(parts).body, limits)) {
    payloads.push(data);
  }
  return payloads;
}

// Splits bytes into pieces of `size`, cutting through lines and characters.
function slices(bytes: Uint8Array, size: number): Uint8Array[] {
  const pieces: Uint8Array[] = [];
  for (let at = 0; at < bytes.length; at += size) {
    pieces.push(bytes.subarray(at, at + size));
  }
  return pieces;
}

describe("readSseData", () => {
  it("yields each data payload and skips comments", async () => {
    await expect(
      collect([
        ": OPENROUTER PROCESSING\n\n",
        'data: {"a":1}\n\n',
        ": OPENROUTER PROCESSING\n",
        'data: {"b":2}\n\n',
      ]),
    ).resolves.toEqual(['{"a":1}', '{"b":2}']);
  });

  it("stops at [DONE] without reading further", async () => {
    const { body, wasCancelled } = streamOf([
      'data: {"a":1}\n\ndata: [DONE]\n\n',
      'data: {"late":true}\n\n',
    ]);
    const payloads: string[] = [];
    for await (const data of readSseData(body, LIMITS)) payloads.push(data);
    expect(payloads).toEqual(['{"a":1}']);
    expect(wasCancelled()).toBe(true);
  });

  it("joins multi-line data and ignores other fields", async () => {
    await expect(
      collect([
        "event: message\nid: 7\nretry: 1000\ndata: first\ndata:second\ndata\n\n",
      ]),
    ).resolves.toEqual(["first\nsecond\n"]);
  });

  it("strips only one leading space from a value", async () => {
    await expect(collect(["data:   padded\n\n"])).resolves.toEqual([
      "  padded",
    ]);
  });

  it("skips events with empty data", async () => {
    await expect(
      collect(["data:\n\ndata: \n\n", "\n\n", 'data: {"a":1}\n\n']),
    ).resolves.toEqual(['{"a":1}']);
  });

  it.each([
    ["CRLF", "\r\n"],
    ["CR", "\r"],
  ])("handles %s line endings", async (_name, eol) => {
    await expect(
      collect([
        `: ping${eol}${eol}data: one${eol}data: two${eol}${eol}data: [DONE]${eol}${eol}`,
      ]),
    ).resolves.toEqual(["one\ntwo"]);
  });

  it("keeps a CRLF split across chunks as one line break", async () => {
    await expect(
      collect(["data: one\r", "\ndata: two\r", "\n\r", "\n"]),
    ).resolves.toEqual(["one\ntwo"]);
  });

  it("reassembles lines and multi-byte characters split across chunks", async () => {
    const dash = encoder.encode("—");
    expect(dash.length).toBe(3);
    await expect(
      collect([
        encoder.encode('data: {"t":"a'),
        dash.subarray(0, 1),
        dash.subarray(1),
        encoder.encode('b"}\n'),
        encoder.encode("\n"),
      ]),
    ).resolves.toEqual(['{"t":"a—b"}']);
  });

  it("reads the recorded stream the same whole or byte by byte", async () => {
    const whole = await collect([FIXTURE]);
    expect(whole).toHaveLength(16);
    for (const payload of whole)
      expect(() => JSON.parse(payload)).not.toThrow();
    await expect(collect(slices(FIXTURE, 1))).resolves.toEqual(whole);
    await expect(collect(slices(FIXTURE, 7))).resolves.toEqual(whole);
    const crlf = encoder.encode(
      new TextDecoder().decode(FIXTURE).replaceAll("\n", "\r\n"),
    );
    await expect(collect(slices(crlf, 5))).resolves.toEqual(whole);
  });

  it("drops an event the stream cuts off", async () => {
    await expect(
      collect(['data: {"a":1}\n\n', 'data: {"cut":']),
    ).resolves.toEqual(['{"a":1}']);
  });

  it("rejects a stream larger than the limit", async () => {
    const payloads: string[] = [];
    const reading = (async () => {
      for await (const data of readSseData(
        streamOf(['data: {"a":1}\n\n', "data: 0123456789\n\n"]).body,
        { maxBytes: 20 },
      )) {
        payloads.push(data);
      }
    })();
    await expect(reading).rejects.toMatchObject({
      name: "OpenRouterError",
      code: "OPENROUTER_UNAVAILABLE",
    });
    expect(payloads).toEqual(['{"a":1}']);
  });

  it("cancels the body when the consumer stops early", async () => {
    const { body, wasCancelled } = streamOf(["data: one\n\n", "data: two\n\n"]);
    for await (const data of readSseData(body, LIMITS)) {
      expect(data).toBe("one");
      break;
    }
    expect(wasCancelled()).toBe(true);
  });

  it("passes on a failing body", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulls++ === 0) controller.enqueue(encoder.encode("data: one\n\n"));
        else controller.error(new Error("socket hang up"));
      },
    });
    const payloads: string[] = [];
    await expect(
      (async () => {
        for await (const data of readSseData(body, LIMITS)) payloads.push(data);
      })(),
    ).rejects.toThrow("socket hang up");
    expect(payloads).toEqual(["one"]);
  });
});
