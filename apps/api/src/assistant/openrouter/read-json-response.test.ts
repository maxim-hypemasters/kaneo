import { describe, expect, it } from "vite-plus/test";
import { readJsonResponse } from "./read-json-response";

function chunked(parts: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(encoder.encode(part));
        controller.close();
      },
    }),
  );
}

describe("readJsonResponse", () => {
  it("parses a body split across chunks", async () => {
    await expect(
      readJsonResponse(chunked(['{"data":', '{"usage":', "1.5}}"]), 1024),
    ).resolves.toEqual({ data: { usage: 1.5 } });
  });

  it("parses a body that is exactly the limit", async () => {
    await expect(readJsonResponse(chunked(["[1,2]"]), 5)).resolves.toEqual([
      1, 2,
    ]);
  });

  it.each([
    ["too large", chunked(["[1,2,3]"]), 5],
    ["malformed", chunked(["{nope"]), 1024],
    ["empty", new Response(null), 1024],
  ])("rejects a %s body as unreachable", async (_name, response, maxBytes) => {
    await expect(readJsonResponse(response, maxBytes)).rejects.toMatchObject({
      code: "OPENROUTER_UNREACHABLE",
    });
  });

  it("rejects a body stream that fails midway", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("{"));
          controller.error(new Error("socket closed"));
        },
      }),
    );
    await expect(readJsonResponse(response, 1024)).rejects.toMatchObject({
      code: "OPENROUTER_UNREACHABLE",
    });
  });
});
