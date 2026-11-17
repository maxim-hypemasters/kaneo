import { setTimeout as sleep } from "node:timers/promises";
import { withoutOutboundTelemetry } from "../../utils/sensitive-outbound";
import {
  FIRST_BYTE_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  MAX_OUTPUT_TOKENS,
  OPENROUTER_BASE,
  OPENROUTER_REFERER,
  OPENROUTER_TITLE,
  REASONING_EFFORT,
} from "../constants";
import { createDeltaAccumulator } from "./accumulate-delta";
import { fromHttpStatus, OpenRouterError } from "./openrouter-error";
import { readSseData } from "./read-sse-data";
import type { CompletionResult, StreamChatCompletionInput } from "./types";

export type { CompletionResult, StreamChatCompletionInput } from "./types";

const MAX_STREAM_BYTES = 4 * 1024 * 1024;
const RETRY_DELAY_MS = 1_000;

/** Tests only: a local server and short timers. Production passes nothing. */
export type StreamChatCompletionTestOptions = {
  baseUrl?: string;
  firstByteTimeoutMs?: number;
  idleTimeoutMs?: number;
  retryDelayMs?: number;
};

// Marks an error thrown by the caller's onDelta, so it is not reported as a
// provider failure.
class DeltaCallbackError {
  constructor(readonly error: unknown) {}
}

function requestBody(input: StreamChatCompletionInput) {
  // Never temperature (Sonnet 5.5 rejects it), usage or stream_options
  // (deprecated; usage always arrives), or parallel_tool_calls (ignored by
  // Anthropic models, so the loop handles batches of calls anyway).
  return {
    model: input.model,
    messages: input.messages,
    ...(input.tools.length > 0
      ? { tools: input.tools, tool_choice: "auto" }
      : {}),
    stream: true,
    max_tokens: input.maxTokens ?? MAX_OUTPUT_TOKENS,
    reasoning: { effort: REASONING_EFFORT },
    provider: {
      data_collection: input.allowDataCollection ? "allow" : "deny",
    },
  };
}

// Aborts with OPENROUTER_UNAVAILABLE when the first body byte, or any later
// one, is late. OpenRouter's ": OPENROUTER PROCESSING" comments count.
function createWatchdog(firstByteMs: number, idleMs: number) {
  const controller = new AbortController();
  const expire = () =>
    controller.abort(new OpenRouterError("OPENROUTER_UNAVAILABLE"));
  let timer = setTimeout(expire, firstByteMs);
  return {
    signal: controller.signal,
    touch() {
      clearTimeout(timer);
      timer = setTimeout(expire, idleMs);
    },
    stop() {
      clearTimeout(timer);
    },
  };
}

async function readCompletion(
  response: Response,
  onBytes: () => void,
  onDelta: (text: string) => void,
): Promise<CompletionResult> {
  if (!response.body) throw new OpenRouterError("OPENROUTER_UNAVAILABLE");
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        onBytes();
        controller.enqueue(chunk);
      },
    }),
  );
  const accumulator = createDeltaAccumulator();
  for await (const data of readSseData(body, { maxBytes: MAX_STREAM_BYTES })) {
    let chunk: unknown;
    try {
      chunk = JSON.parse(data);
    } catch {
      throw new OpenRouterError("OPENROUTER_UNAVAILABLE");
    }
    const { text, error } = accumulator.push(chunk);
    if (error) throw error;
    if (text) {
      try {
        onDelta(text);
      } catch (callbackError) {
        throw new DeltaCallbackError(callbackError);
      }
    }
  }
  // A stream cut off before finish_reason is incomplete, not a short answer.
  if (!accumulator.hasFinished()) {
    throw new OpenRouterError("OPENROUTER_UNAVAILABLE");
  }
  return accumulator.result();
}

/**
 * Streams one chat completion from OpenRouter, calling `onDelta` with each
 * piece of answer text as it arrives.
 *
 * Throws OpenRouterError with a fixed message: HTTP errors map through
 * fromHttpStatus, an in-stream error chunk through fromStreamErrorChunk, and
 * timeouts, network failures, redirects and malformed or cut-off streams are
 * OPENROUTER_UNAVAILABLE. When `input.signal` aborts, the request is closed
 * (which stops OpenRouter billing on supported providers) and the promise
 * rejects with the signal's reason. A 429 or 5xx is retried once after a
 * second; nothing is retried once the stream has started.
 */
export async function streamChatCompletion(
  input: StreamChatCompletionInput,
  testOptions: StreamChatCompletionTestOptions = {},
): Promise<CompletionResult> {
  const url = `${testOptions.baseUrl ?? OPENROUTER_BASE}/chat/completions`;
  const init: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": OPENROUTER_REFERER,
      "X-OpenRouter-Title": OPENROUTER_TITLE,
    },
    body: JSON.stringify(requestBody(input)),
    redirect: "error",
  };

  try {
    for (let attempt = 1; ; attempt++) {
      input.signal.throwIfAborted();
      const watchdog = createWatchdog(
        testOptions.firstByteTimeoutMs ?? FIRST_BYTE_TIMEOUT_MS,
        testOptions.idleTimeoutMs ?? IDLE_TIMEOUT_MS,
      );
      try {
        const response = await withoutOutboundTelemetry(() =>
          fetch(url, {
            ...init,
            signal: AbortSignal.any([input.signal, watchdog.signal]),
          }),
        );
        if (response.ok) {
          return await readCompletion(response, watchdog.touch, (text) =>
            input.onDelta(text),
          );
        }
        // The body may echo the request, so it is only discarded.
        void response.body?.cancel().catch(() => {});
        const retryable = response.status === 429 || response.status >= 500;
        if (attempt > 1 || !retryable) {
          throw fromHttpStatus(
            response.status,
            response.headers.get("retry-after"),
          );
        }
      } finally {
        watchdog.stop();
      }
      await sleep(testOptions.retryDelayMs ?? RETRY_DELAY_MS, undefined, {
        signal: input.signal,
      });
    }
  } catch (error) {
    if (error instanceof DeltaCallbackError) throw error.error;
    if (input.signal.aborted) throw input.signal.reason;
    if (error instanceof OpenRouterError) throw error;
    // Network and parser errors can carry URLs or upstream text: drop them.
    throw new OpenRouterError("OPENROUTER_UNAVAILABLE");
  }
}
