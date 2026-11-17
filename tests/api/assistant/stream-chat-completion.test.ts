import { readFileSync } from "node:fs";
import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { OpenRouterError } from "../../../apps/api/src/assistant/openrouter/openrouter-error";
import {
  type StreamChatCompletionInput,
  type StreamChatCompletionTestOptions,
  streamChatCompletion,
} from "../../../apps/api/src/assistant/openrouter/stream-chat-completion";
import type { ToolDefinition } from "../../../apps/api/src/assistant/openrouter/types";

const KEY = "sk-or-v1-0123456789abcdef0123456789abcdef";
const FIXTURE = readFileSync(
  new URL("./fixtures/sonnet-5.5-parallel-tool-calls.sse", import.meta.url),
);
const FIXTURE_TEXT = FIXTURE.toString("utf8");
const FIXTURE_DELTAS = [
  "I’ll look up the",
  " Onboarding feature and",
  " your open bugs — one moment.",
];
// Everything up to and including the first answer text.
const FIRST_PART = Buffer.from(
  FIXTURE_TEXT.slice(
    0,
    FIXTURE_TEXT.indexOf("\n\n", FIXTURE_TEXT.indexOf(FIXTURE_DELTAS[0])) + 2,
  ),
);
const REST = FIXTURE.subarray(FIRST_PART.length);

const TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "search",
    description: "Search the workspace",
    parameters: {
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
    },
  },
};

type Received = {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
};
type Reply = (response: ServerResponse) => void | Promise<void>;

let server: Server;
let base: string;
let received: Received[];
// One reply per request, in order; the last one repeats.
let replies: Reply[];
let closedEarly: Promise<void>;
let markClosedEarly: () => void;

beforeEach(async () => {
  received = [];
  replies = [];
  closedEarly = new Promise((resolve) => {
    markClosedEarly = resolve;
  });
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      // The client went away before the reply was complete.
      response.on("close", () => {
        if (!response.writableFinished) markClosedEarly();
      });
      const reply = replies[Math.min(received.length, replies.length) - 1];
      void reply?.(response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Missing test port");
  }
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function startSse(response: ServerResponse) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  });
}

const sse =
  (...parts: (string | Buffer)[]): Reply =>
  (response) => {
    startSse(response);
    for (const part of parts) response.write(part);
    response.end();
  };

// Starts the stream and never finishes it.
const hangAfter =
  (...parts: (string | Buffer)[]): Reply =>
  (response) => {
    startSse(response);
    for (const part of parts) response.write(part);
  };

const fail =
  (status: number, headers: Record<string, string> = {}): Reply =>
  (response) => {
    response.writeHead(status, {
      "Content-Type": "application/json",
      ...headers,
    });
    // Upstream bodies can echo the key or the prompt.
    response.end(
      JSON.stringify({
        error: { code: status, message: `Rejected key ${KEY}` },
      }),
    );
  };

function input(
  overrides: Partial<StreamChatCompletionInput> = {},
): StreamChatCompletionInput {
  return {
    apiKey: KEY,
    model: "anthropic/claude-sonnet-5.5",
    messages: [
      { role: "system", content: "You are Kaneo's workspace assistant." },
      { role: "user", content: "What is left on Onboarding?" },
    ],
    tools: [TOOL],
    allowDataCollection: false,
    signal: new AbortController().signal,
    onDelta: () => {},
    ...overrides,
  };
}

function options(
  extra: StreamChatCompletionTestOptions = {},
): StreamChatCompletionTestOptions {
  return { baseUrl: `${base}/api/v1`, retryDelayMs: 10, ...extra };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the completion to fail");
}

function expectSanitized(error: unknown) {
  expect(error).toBeInstanceOf(OpenRouterError);
  expect(error).not.toHaveProperty("cause");
  expect(String(error)).not.toContain(KEY);
  expect(JSON.stringify(error)).not.toContain(KEY);
  expect((error as Error).stack ?? "").not.toContain(KEY);
  expect((error as Error).message).not.toContain("Rejected");
}

describe("streamChatCompletion", () => {
  it("posts the documented request with attribution headers", async () => {
    replies = [sse(FIXTURE)];
    const result = await streamChatCompletion(input(), options());

    expect(received).toHaveLength(1);
    const [request] = received;
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe("/api/v1/chat/completions");
    expect(request?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(request?.headers["http-referer"]).toBe("https://kaneo.app");
    expect(request?.headers["x-openrouter-title"]).toBe("Kaneo");
    expect(request?.headers["content-type"]).toBe("application/json");

    const body = JSON.parse(request?.body ?? "{}");
    expect(body).toEqual({
      model: "anthropic/claude-sonnet-5.5",
      messages: input().messages,
      tools: [TOOL],
      tool_choice: "auto",
      stream: true,
      max_tokens: 32_000,
      reasoning: { effort: "low" },
      provider: { data_collection: "deny" },
    });
    for (const key of [
      "temperature",
      "usage",
      "stream_options",
      "parallel_tool_calls",
    ]) {
      expect(body).not.toHaveProperty(key);
    }

    expect(result).toMatchObject({
      content: FIXTURE_DELTAS.join(""),
      finishReason: "tool_calls",
      usage: { promptTokens: 9876, completionTokens: 214, costUsd: 0.021892 },
      toolCalls: [
        { name: "search", arguments: '{"q":"Onboarding","type":"features"}' },
        { name: "list_my_tasks", arguments: '{"countOnly":false}' },
      ],
    });
    expect(result.reasoningDetails).toHaveLength(1);
  });

  it("omits tools when none are offered and passes the data policy", async () => {
    replies = [sse(FIXTURE)];
    await streamChatCompletion(
      input({ tools: [], allowDataCollection: true }),
      options(),
    );
    const body = JSON.parse(received[0]?.body ?? "{}");
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("tool_choice");
    expect(body.provider).toEqual({ data_collection: "allow" });
  });

  it("delivers each delta in order as it arrives", async () => {
    let firstDelta!: () => void;
    const sawFirstDelta = new Promise<void>((resolve) => {
      firstDelta = resolve;
    });
    replies = [
      async (response) => {
        startSse(response);
        response.write(FIRST_PART);
        // Hold the rest until the client has handled the first text.
        await sawFirstDelta;
        for (let at = 0; at < REST.length; at += 11) {
          response.write(REST.subarray(at, at + 11));
        }
        response.end();
      },
    ];
    const deltas: string[] = [];
    const result = await streamChatCompletion(
      input({
        onDelta: (text) => {
          deltas.push(text);
          firstDelta();
        },
      }),
      options(),
    );
    expect(deltas).toEqual(FIXTURE_DELTAS);
    expect(result.content).toBe(FIXTURE_DELTAS.join(""));
  });

  it("closes the upstream request when the caller aborts mid-stream", async () => {
    replies = [hangAfter(FIRST_PART)];
    const controller = new AbortController();
    const error = await failure(
      streamChatCompletion(
        input({ signal: controller.signal, onDelta: () => controller.abort() }),
        options(),
      ),
    );
    expect((error as Error).name).toBe("AbortError");
    await closedEarly;
    expect(received).toHaveLength(1);
  });

  it("closes the upstream request when the caller aborts before a reply", async () => {
    const controller = new AbortController();
    replies = [() => controller.abort()];
    const error = await failure(
      streamChatCompletion(input({ signal: controller.signal }), options()),
    );
    expect((error as Error).name).toBe("AbortError");
    await closedEarly;
  });

  it("does not send anything once the caller has aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await failure(
      streamChatCompletion(input({ signal: controller.signal }), options()),
    );
    expect((error as Error).name).toBe("AbortError");
    expect(received).toHaveLength(0);
  });

  it("times out a stream that goes idle", async () => {
    replies = [hangAfter(FIRST_PART)];
    const deltas: string[] = [];
    const error = await failure(
      streamChatCompletion(
        input({ onDelta: (text) => deltas.push(text) }),
        options({ idleTimeoutMs: 100 }),
      ),
    );
    expect(error).toMatchObject({ code: "OPENROUTER_UNAVAILABLE" });
    expectSanitized(error);
    expect(deltas).toEqual([FIXTURE_DELTAS[0]]);
    await closedEarly;
    expect(received).toHaveLength(1);
  });

  it.each<[string, Reply]>([
    ["no reply at all", () => {}],
    [
      "headers but no body",
      (response) => {
        startSse(response);
        response.flushHeaders();
      },
    ],
  ])("times out %s without retrying", async (_name, reply) => {
    replies = [reply];
    const error = await failure(
      streamChatCompletion(input(), options({ firstByteTimeoutMs: 100 })),
    );
    expect(error).toMatchObject({ code: "OPENROUTER_UNAVAILABLE" });
    expectSanitized(error);
    await closedEarly;
    expect(received).toHaveLength(1);
  });

  it("keeps a slow stream alive with comments", async () => {
    replies = [
      async (response) => {
        startSse(response);
        for (let i = 0; i < 8; i++) {
          response.write(": OPENROUTER PROCESSING\n\n");
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        response.end(FIXTURE);
      },
    ];
    // About 240 ms in all, with no gap longer than the 150 ms timeouts.
    const result = await streamChatCompletion(
      input(),
      options({ firstByteTimeoutMs: 150, idleTimeoutMs: 150 }),
    );
    expect(result.finishReason).toBe("tool_calls");
  });

  it("retries a 503 once, a second later", async () => {
    replies = [fail(503), sse(FIXTURE)];
    const startedAt = Date.now();
    const result = await streamChatCompletion(input(), {
      baseUrl: `${base}/api/v1`,
    });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(950);
    expect(received).toHaveLength(2);
    expect(received[1]?.body).toBe(received[0]?.body);
    expect(result.finishReason).toBe("tool_calls");
  });

  it("gives up after the retry fails too", async () => {
    replies = [fail(503)];
    const error = await failure(streamChatCompletion(input(), options()));
    expect(error).toMatchObject({
      code: "OPENROUTER_UNAVAILABLE",
      status: 503,
      retryable: true,
    });
    expectSanitized(error);
    expect(received).toHaveLength(2);
  });

  it("does not retry once the stream has started", async () => {
    replies = [
      (response) => {
        startSse(response);
        response.write(FIRST_PART, () => response.socket?.destroy());
      },
      sse(FIXTURE),
    ];
    const error = await failure(streamChatCompletion(input(), options()));
    expect(error).toMatchObject({ code: "OPENROUTER_UNAVAILABLE" });
    expectSanitized(error);
    expect(received).toHaveLength(1);
  });

  it.each([
    [401, "OPENROUTER_KEY_INVALID", 1],
    [402, "OPENROUTER_CREDITS", 1],
    [403, "OPENROUTER_CONTENT_FILTERED", 1],
    [400, "OPENROUTER_MODEL", 1],
    [429, "OPENROUTER_RATE_LIMITED", 2],
    [502, "OPENROUTER_UNAVAILABLE", 2],
  ])(
    "maps HTTP %i to %s after %i request(s)",
    async (status, code, requests) => {
      replies = [fail(status, { "Retry-After": "7" })];
      const error = await failure(streamChatCompletion(input(), options()));
      expect(error).toMatchObject({ code, status, retryAfterMs: 7000 });
      expectSanitized(error);
      expect(received).toHaveLength(requests);
    },
  );

  it("refuses to follow a redirect", async () => {
    replies = [
      (response) => {
        response.writeHead(307, { Location: `${base}/elsewhere` });
        response.end();
      },
    ];
    const error = await failure(streamChatCompletion(input(), options()));
    expect(error).toMatchObject({ code: "OPENROUTER_UNAVAILABLE" });
    expectSanitized(error);
    expect(received.map((request) => request.url)).toEqual([
      "/api/v1/chat/completions",
    ]);
  });

  it("maps an in-stream error chunk without its message", async () => {
    const errorChunk = {
      id: "gen-1",
      object: "chat.completion.chunk",
      error: { code: 402, message: `Insufficient credits for ${KEY}` },
      choices: [{ index: 0, delta: { content: "" }, finish_reason: "error" }],
    };
    replies = [sse(FIRST_PART, `data: ${JSON.stringify(errorChunk)}\n\n`)];
    const deltas: string[] = [];
    const error = await failure(
      streamChatCompletion(
        input({ onDelta: (text) => deltas.push(text) }),
        options(),
      ),
    );
    expect(error).toMatchObject({ code: "OPENROUTER_CREDITS" });
    expectSanitized(error);
    expect((error as Error).message).not.toContain("Insufficient");
    expect(deltas).toEqual([FIXTURE_DELTAS[0]]);
    expect(received).toHaveLength(1);
  });

  it.each([
    ["ends before finish_reason", sse(FIRST_PART, "data: [DONE]\n\n")],
    ["sends malformed data", sse('data: {"choices":\n\n')],
    ["answers with JSON instead of a stream", sse('{"choices":[]}')],
  ])("fails a stream that %s", async (_name, reply) => {
    replies = [reply];
    const error = await failure(streamChatCompletion(input(), options()));
    expect(error).toMatchObject({ code: "OPENROUTER_UNAVAILABLE" });
    expectSanitized(error);
  });

  it("passes an onDelta error through unchanged", async () => {
    replies = [sse(FIXTURE)];
    const bug = new RangeError("broken listener");
    const error = await failure(
      streamChatCompletion(
        input({
          onDelta: () => {
            throw bug;
          },
        }),
        options(),
      ),
    );
    expect(error).toBe(bug);
  });
});
