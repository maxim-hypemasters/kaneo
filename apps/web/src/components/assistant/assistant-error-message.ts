import { HttpError } from "@/lib/http-error";
import type { AssistantStreamErrorCode } from "./assistant-stream-event";

// The JSON error codes of the assistant routes, mirroring ASSISTANT_ERRORS in
// apps/api/src/assistant/errors.ts.
export const ASSISTANT_REQUEST_ERROR_CODES = [
  "ASSISTANT_DISABLED",
  "ASSISTANT_CHAT_NOT_FOUND",
  "ASSISTANT_NOT_CONFIGURED",
  "ASSISTANT_KEY_UNREADABLE",
  "ASSISTANT_CHAT_BUSY",
  "ASSISTANT_NOTHING_PENDING",
  "ASSISTANT_NOTHING_TO_CONTINUE",
  "ASSISTANT_PENDING_APPROVALS",
  "ASSISTANT_TOO_MANY_TURNS",
  "ASSISTANT_DAILY_LIMIT",
  "OPENROUTER_KEY_REQUIRED",
  "OPENROUTER_KEY_INVALID",
  "ASSISTANT_MODEL_UNSUPPORTED",
  "UNSUPPORTED_CONTENT_TYPE",
  "OPENROUTER_UNREACHABLE",
] as const;

// Failures only the browser sees.
export const ASSISTANT_CLIENT_ERROR_CODES = [
  "CONNECTION_LOST",
  "NETWORK",
  "MESSAGE_TOO_LONG",
  "REQUEST_FAILED",
] as const;

export type AssistantRequestErrorCode =
  (typeof ASSISTANT_REQUEST_ERROR_CODES)[number];
export type AssistantClientErrorCode =
  (typeof ASSISTANT_CLIENT_ERROR_CODES)[number];
export type AssistantErrorCode =
  | AssistantStreamErrorCode
  | AssistantRequestErrorCode
  | AssistantClientErrorCode;

/** Why a turn ended early, and whether trying again may help. */
export type AssistantTurnFailure = {
  code: AssistantErrorCode;
  retryable: boolean;
};

const MESSAGE_KEYS: Record<AssistantErrorCode, string> = {
  // Stream errors.
  OPENROUTER_KEY_INVALID: "workspace:assistant.errors.keyInvalid",
  OPENROUTER_CREDITS: "workspace:assistant.errors.credits",
  OPENROUTER_RATE_LIMITED: "workspace:assistant.errors.rateLimited",
  OPENROUTER_MODEL: "workspace:assistant.errors.model",
  OPENROUTER_UNAVAILABLE: "workspace:assistant.errors.unavailable",
  OPENROUTER_CONTENT_FILTERED: "workspace:assistant.errors.contentFiltered",
  ASSISTANT_STEP_LIMIT: "workspace:assistant.errors.stepLimit",
  ASSISTANT_DAILY_LIMIT: "workspace:assistant.errors.dailyLimit",
  ASSISTANT_INTERNAL: "workspace:assistant.errors.internal",
  // Refusals before a turn streams.
  ASSISTANT_DISABLED: "workspace:assistant.errors.disabled",
  ASSISTANT_CHAT_NOT_FOUND: "workspace:assistant.errors.chatNotFound",
  ASSISTANT_NOT_CONFIGURED: "workspace:assistant.errors.notConfigured",
  ASSISTANT_KEY_UNREADABLE: "workspace:assistant.errors.keyUnreadable",
  ASSISTANT_CHAT_BUSY: "workspace:assistant.errors.chatBusy",
  ASSISTANT_NOTHING_PENDING: "workspace:assistant.errors.nothingPending",
  ASSISTANT_NOTHING_TO_CONTINUE: "workspace:assistant.errors.nothingToContinue",
  ASSISTANT_PENDING_APPROVALS: "workspace:assistant.errors.pendingApprovals",
  ASSISTANT_TOO_MANY_TURNS: "workspace:assistant.errors.tooManyTurns",
  OPENROUTER_KEY_REQUIRED: "workspace:assistant.errors.notConfigured",
  ASSISTANT_MODEL_UNSUPPORTED: "workspace:assistant.errors.model",
  UNSUPPORTED_CONTENT_TYPE: "workspace:assistant.errors.requestFailed",
  OPENROUTER_UNREACHABLE: "workspace:assistant.errors.unavailable",
  // Browser-side failures.
  CONNECTION_LOST: "workspace:assistant.errors.connectionLost",
  NETWORK: "workspace:assistant.errors.network",
  MESSAGE_TOO_LONG: "workspace:assistant.errors.messageTooLong",
  REQUEST_FAILED: "workspace:assistant.errors.requestFailed",
};

// Refusals that clear up on their own.
const RETRYABLE_REQUEST_CODES: ReadonlySet<string> = new Set([
  "ASSISTANT_CHAT_BUSY",
  "ASSISTANT_TOO_MANY_TURNS",
  "OPENROUTER_UNREACHABLE",
]);

const isKnownCode = (code: unknown): code is AssistantErrorCode =>
  typeof code === "string" && Object.hasOwn(MESSAGE_KEYS, code);

/** The static i18n key for a failure. The server's text is never shown. */
export function assistantErrorMessageKey(code: AssistantErrorCode): string {
  return MESSAGE_KEYS[code] ?? MESSAGE_KEYS.REQUEST_FAILED;
}

/** Maps a request that failed before anything streamed to a failure. */
export function failureFromRequestError(error: unknown): AssistantTurnFailure {
  if (!(error instanceof HttpError)) {
    return { code: "NETWORK", retryable: true };
  }
  if (isKnownCode(error.code)) {
    return {
      code: error.code,
      retryable: RETRYABLE_REQUEST_CODES.has(error.code),
    };
  }
  if (error.status === 413)
    return { code: "MESSAGE_TOO_LONG", retryable: false };
  if (error.status >= 500) {
    return { code: "ASSISTANT_INTERNAL", retryable: true };
  }
  return { code: "REQUEST_FAILED", retryable: false };
}
