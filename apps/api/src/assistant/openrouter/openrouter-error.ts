import type { AssistantStreamErrorCode } from "../stream-events";

export type OpenRouterErrorCode =
  | AssistantStreamErrorCode
  | "OPENROUTER_UNREACHABLE";

// Fixed messages only: upstream text can echo prompts, keys or provider
// details, so it never reaches logs, Sentry or the browser.
const DETAILS: Record<
  OpenRouterErrorCode,
  { message: string; retryable: boolean }
> = {
  OPENROUTER_KEY_INVALID: {
    message: "OpenRouter rejected the API key",
    retryable: false,
  },
  OPENROUTER_CREDITS: {
    message: "The OpenRouter key is out of credits",
    retryable: false,
  },
  OPENROUTER_RATE_LIMITED: {
    message: "OpenRouter is rate limiting requests",
    retryable: true,
  },
  OPENROUTER_MODEL: {
    message: "The model could not handle the request",
    retryable: false,
  },
  OPENROUTER_UNAVAILABLE: {
    message: "The model provider is unavailable",
    retryable: true,
  },
  OPENROUTER_CONTENT_FILTERED: {
    message: "The provider's moderation blocked the request",
    retryable: false,
  },
  OPENROUTER_UNREACHABLE: {
    message: "OpenRouter could not be reached",
    retryable: true,
  },
  ASSISTANT_STEP_LIMIT: {
    message: "The assistant reached its step limit",
    retryable: false,
  },
  ASSISTANT_DAILY_LIMIT: {
    message: "The daily assistant limit is reached",
    retryable: false,
  },
  ASSISTANT_INTERNAL: {
    message: "The assistant failed unexpectedly",
    retryable: true,
  },
};

export class OpenRouterError extends Error {
  readonly code: OpenRouterErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    code: OpenRouterErrorCode,
    options: { status?: number; retryAfterMs?: number } = {},
  ) {
    super(DETAILS[code].message);
    this.name = "OpenRouterError";
    this.code = code;
    this.retryable = DETAILS[code].retryable;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

/** Retry-After as milliseconds: delay seconds or an HTTP date. */
export function parseRetryAfter(
  value: string | null | undefined,
  now = Date.now(),
): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  // HTTP dates start with the day name; Date.parse alone accepts "-5".
  if (!/^[A-Za-z]{3}/.test(trimmed)) return undefined;
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

function codeForStatus(status: number): OpenRouterErrorCode {
  if (status === 401) return "OPENROUTER_KEY_INVALID";
  if (status === 402) return "OPENROUTER_CREDITS";
  // OpenRouter answers 403 when a moderated model flags the input.
  if (status === 403) return "OPENROUTER_CONTENT_FILTERED";
  if (status === 429) return "OPENROUTER_RATE_LIMITED";
  // Bad parameters, no endpoint for this model, or a context too long.
  if ([400, 404, 413, 422].includes(status)) return "OPENROUTER_MODEL";
  return "OPENROUTER_UNAVAILABLE";
}

export function fromHttpStatus(
  status: number,
  retryAfter?: string | null,
): OpenRouterError {
  return new OpenRouterError(codeForStatus(status), {
    status,
    retryAfterMs: parseRetryAfter(retryAfter),
  });
}

const CODE_KEYWORDS: [RegExp, OpenRouterErrorCode][] = [
  [/rate.?limit/i, "OPENROUTER_RATE_LIMITED"],
  [/credit|quota|payment|billing/i, "OPENROUTER_CREDITS"],
  [/moderation|content.?filter|flagged/i, "OPENROUTER_CONTENT_FILTERED"],
  [/unauthori[sz]ed|api.?key|authentication/i, "OPENROUTER_KEY_INVALID"],
  [/context.?length|invalid.?request|not.?found|model/i, "OPENROUTER_MODEL"],
];

/**
 * The error a streamed chunk reports, either as a top-level `error` or with
 * `finish_reason: "error"`. Only its code is used, never its message.
 */
export function fromStreamErrorChunk(chunk: unknown): OpenRouterError {
  const error =
    typeof chunk === "object" && chunk !== null && "error" in chunk
      ? (chunk as { error: unknown }).error
      : null;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code: unknown }).code
      : null;

  if (typeof code === "number" && Number.isInteger(code)) {
    return fromHttpStatus(code);
  }
  if (typeof code === "string") {
    if (/^\d{3}$/.test(code)) return fromHttpStatus(Number(code));
    const match = CODE_KEYWORDS.find(([pattern]) => pattern.test(code));
    if (match) return new OpenRouterError(match[1]);
  }
  return new OpenRouterError("OPENROUTER_UNAVAILABLE");
}
