import { vi } from "vite-plus/test";
import { internalApiUrl } from "../../../../apps/api/src/utils/internal-api-url";

const API_BASE = "https://openrouter.ai/api/v1";

/**
 * How the fake answers one request: a JSON or text response, a network
 * failure, a request that hangs until its signal aborts, or a handler.
 */
export type ScriptedResponse =
  | {
      status?: number;
      json?: unknown;
      body?: string;
      headers?: Record<string, string>;
    }
  | { networkError: true }
  | { hang: true }
  | ((request: Request) => Response | Promise<Response>);

export type RecordedRequest = {
  method: string;
  /**
   * Path below /api/v1 for OpenRouter, such as "/key" or
   * "/chat/completions"; the full path and query for loopback requests.
   */
  path: string;
  url: string;
  headers: Headers;
  body: string | null;
  /** Aborts when the caller gives up on the request. */
  signal: AbortSignal;
};

/** A POST /chat/completions body, as the assistant sends it. */
export type ChatRequestBody = {
  model: string;
  messages: {
    role: string;
    content: string | null;
    tool_calls?: {
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }[];
    tool_call_id?: string;
    reasoning_details?: unknown[];
  }[];
  tools?: { type: string; function: { name: string } }[];
  [key: string]: unknown;
};

/** Anything with Hono's app.request, to serve loopback calls in-process. */
export type LoopbackApp = {
  request(input: Request): Response | Promise<Response>;
};

export type FakeOpenRouter = {
  /** Every OpenRouter request, in order. */
  requests: RecordedRequest[];
  requestsTo(path: string): RecordedRequest[];
  /** The parsed body of every POST /chat/completions, in order. */
  chatRequestBodies(): ChatRequestBody[];
  /** Every request to this API's internal URL, served by `app`. */
  loopbackRequests: RecordedRequest[];
  /** Answer every GET /key with this from now on. */
  setKeyResponse(response: ScriptedResponse): void;
  /** Answer every GET /models with this from now on. */
  setModelsResponse(response: ScriptedResponse): void;
  /** Answer the next POST /chat/completions requests, one each, in order. */
  queueChatResponses(...responses: ScriptedResponse[]): void;
  restore(): void;
};

export const FAKE_KEY_INFO = {
  data: {
    label: "sk-or-v1-fak...",
    usage: 1.5,
    limit: 20,
    limit_remaining: 18.5,
    is_free_tier: false,
  },
};

function model(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    canonical_slug: `${id}-20261001`,
    name,
    context_length: 200_000,
    architecture: { output_modalities: ["text"] },
    pricing: { prompt: "0.000003", completion: "0.000015" },
    supported_parameters: ["tools", "tool_choice", "reasoning"],
    ...extra,
  };
}

export const FAKE_MODELS = {
  data: [
    model("openai/gpt-6-mini", "OpenAI: GPT-6 Mini", {
      pricing: { prompt: "0.0000004", completion: "0.0000016" },
    }),
    model("anthropic/claude-haiku-5.5", "Anthropic: Claude Haiku 5.5", {
      pricing: { prompt: "0.000001", completion: "0.000005" },
    }),
    model("anthropic/claude-sonnet-5.5", "Anthropic: Claude Sonnet 5.5", {
      context_length: 1_000_000,
    }),
    model("anthropic/claude-sonnet-5.5:batch", "Batch Sonnet"),
    model("legacy/retired-model", "Retired", { expiration_date: "2020-01-01" }),
  ],
};

/**
 * An SSE body of `data:` records, ending with [DONE] unless `done` is false.
 * A string starting with ":" is sent as a comment line, as OpenRouter's
 * keep-alives are.
 */
export function sseBody(chunks: unknown[], { done = true } = {}): string {
  const records = chunks.map((chunk) =>
    typeof chunk === "string" && chunk.startsWith(":")
      ? `${chunk}\n\n`
      : `data: ${typeof chunk === "string" ? chunk : JSON.stringify(chunk)}\n\n`,
  );
  return records.join("") + (done ? "data: [DONE]\n\n" : "");
}

export function sseResponse(
  chunks: unknown[],
  options?: { done?: boolean },
): ScriptedResponse {
  return {
    headers: { "content-type": "text/event-stream" },
    body: sseBody(chunks, options),
  };
}

/** One scripted model reply. Tool call arguments may be an object or raw text. */
export type FakeReply = {
  /** Reasoning, streamed as a reasoning.text detail plus its signature. */
  reasoning?: string;
  /** Answer text, streamed as one delta per piece. */
  text?: string[];
  toolCalls?: { id: string; name: string; arguments: unknown }[];
  /** Defaults to "tool_calls" with tool calls, else "stop". */
  finishReason?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; cost?: number };
};

const FAKE_FORMAT = "anthropic-claude-v1";

/** One chat.completion.chunk carrying `delta` for the first choice. */
export function completionChunk(
  delta: Record<string, unknown>,
  finishReason: string | null = null,
) {
  return {
    id: "gen-fake",
    object: "chat.completion.chunk",
    created: 1_790_000_000,
    model: "anthropic/claude-sonnet-5.5",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

/**
 * The chunks OpenRouter streams for `reply`: a role chunk, reasoning
 * fragments, text deltas, tool calls whose arguments arrive in two
 * fragments, the finish_reason chunk and a usage chunk that repeats it.
 */
export function completionChunks(reply: FakeReply): unknown[] {
  const calls = reply.toolCalls ?? [];
  const finishReason =
    reply.finishReason ?? (calls.length > 0 ? "tool_calls" : "stop");
  const chunks: unknown[] = [
    completionChunk({ role: "assistant", content: "" }, null),
    ": OPENROUTER PROCESSING",
  ];
  if (reply.reasoning !== undefined) {
    const detail = { type: "reasoning.text", index: 0, format: FAKE_FORMAT };
    chunks.push(
      completionChunk(
        {
          reasoning: reply.reasoning,
          reasoning_details: [{ ...detail, text: reply.reasoning }],
        },
        null,
      ),
      completionChunk(
        { reasoning_details: [{ ...detail, text: "", signature: "sig-fake" }] },
        null,
      ),
    );
  }
  for (const text of reply.text ?? []) {
    chunks.push(completionChunk({ content: text }, null));
  }
  calls.forEach((call, index) => {
    const args =
      typeof call.arguments === "string"
        ? call.arguments
        : JSON.stringify(call.arguments);
    const half = Math.floor(args.length / 2);
    chunks.push(
      completionChunk(
        {
          tool_calls: [
            {
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: "" },
            },
          ],
        },
        null,
      ),
    );
    for (const piece of [args.slice(0, half), args.slice(half)]) {
      chunks.push(
        completionChunk(
          { tool_calls: [{ index, function: { arguments: piece } }] },
          null,
        ),
      );
    }
  });
  chunks.push(completionChunk({}, finishReason));
  chunks.push({
    ...completionChunk({}, finishReason),
    usage: reply.usage ?? {
      prompt_tokens: 1200,
      completion_tokens: 40,
      cost: 0.0028,
    },
  });
  return chunks;
}

/** `reply` streamed in full, ending with [DONE]. */
export function chatReply(reply: FakeReply): ScriptedResponse {
  return sseResponse(completionChunks(reply));
}

/**
 * Streams `chunks`, then keeps the response open until the request is
 * aborted, as a slow model would; the body then fails like a closed socket.
 */
export function heldSseResponse(chunks: unknown[]): ScriptedResponse {
  return (request) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(sseBody(chunks, { done: false })),
        );
        const fail = () => {
          try {
            controller.error(request.signal.reason);
          } catch {
            // Already closed.
          }
        };
        if (request.signal.aborted) fail();
        else request.signal.addEventListener("abort", fail, { once: true });
      },
    });
    return new Response(body, {
      headers: { "content-type": "text/event-stream" },
    });
  };
}

function hangUntilAborted(signal: AbortSignal): Promise<Response> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

async function respond(
  scripted: ScriptedResponse,
  request: Request,
): Promise<Response> {
  if (typeof scripted === "function") return scripted(request);
  if ("networkError" in scripted) throw new TypeError("fetch failed");
  if ("hang" in scripted) return hangUntilAborted(request.signal);
  const headers = new Headers(scripted.headers);
  if (scripted.json !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new Response(
    scripted.json !== undefined
      ? JSON.stringify(scripted.json)
      : (scripted.body ?? ""),
    { status: scripted.status ?? 200, headers },
  );
}

function requestUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) return input.url;
  return input instanceof URL ? input.href : String(input);
}

async function record(
  request: Request,
  path: string,
): Promise<RecordedRequest> {
  return {
    method: request.method,
    path,
    url: request.url,
    headers: new Headers(request.headers),
    body: request.body ? await request.clone().text() : null,
    signal: request.signal,
  };
}

/**
 * Replaces global fetch: OpenRouter API requests get scripted answers and
 * are recorded. With `app`, requests to this API's internal URL (the
 * assistant's loopback tool calls) are recorded and served by
 * `app.request`, headers included, so they pass real authentication. Every
 * other URL goes to `fallback` (the original fetch by default). Call
 * `restore()` after each test.
 */
export function installFakeOpenRouter(
  options: { fallback?: typeof fetch; app?: LoopbackApp } = {},
): FakeOpenRouter {
  const fallback = options.fallback ?? globalThis.fetch;
  const requests: RecordedRequest[] = [];
  const loopbackRequests: RecordedRequest[] = [];
  const chatQueue: ScriptedResponse[] = [];
  let keyResponse: ScriptedResponse = { json: FAKE_KEY_INFO };
  let modelsResponse: ScriptedResponse = { json: FAKE_MODELS };

  const route = (method: string, path: string): ScriptedResponse => {
    if (method === "GET" && path === "/key") return keyResponse;
    if (method === "GET" && path === "/models") return modelsResponse;
    if (method === "POST" && path === "/chat/completions") {
      return (
        chatQueue.shift() ?? {
          status: 500,
          json: {
            error: { code: 500, message: "fake: no chat response queued" },
          },
        }
      );
    }
    return {
      status: 404,
      json: { error: { code: 404, message: `fake: ${method} ${path}` } },
    };
  };

  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (options.app && url.startsWith(`${internalApiUrl}/`)) {
      const request = new Request(input, init);
      const { pathname, search } = new URL(url);
      loopbackRequests.push(await record(request, pathname + search));
      return options.app.request(request);
    }
    if (!url.startsWith(`${API_BASE}/`)) return fallback(input, init);

    const request = new Request(input, init);
    const path = new URL(url).pathname.slice("/api/v1".length);
    requests.push(await record(request, path));
    request.signal.throwIfAborted();
    return respond(route(request.method, path), request);
  };

  vi.stubGlobal("fetch", fakeFetch);

  return {
    requests,
    requestsTo: (path) => requests.filter((request) => request.path === path),
    chatRequestBodies: () =>
      requests
        .filter(
          (request) =>
            request.method === "POST" && request.path === "/chat/completions",
        )
        .map((request) => JSON.parse(request.body ?? "{}") as ChatRequestBody),
    loopbackRequests,
    setKeyResponse: (response) => {
      keyResponse = response;
    },
    setModelsResponse: (response) => {
      modelsResponse = response;
    },
    queueChatResponses: (...responses) => {
      chatQueue.push(...responses);
    },
    restore: () => {
      vi.unstubAllGlobals();
    },
  };
}
