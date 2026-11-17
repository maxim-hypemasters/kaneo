import { OpenRouterError } from "../openrouter/openrouter-error";
import type { ProviderErrorCode } from "../settings/record-provider-error";
import type { AssistantStreamErrorCode } from "../stream-events";

/** What a turn's `error` event reports: a code only, never upstream text. */
export type StreamFailure = {
  code: AssistantStreamErrorCode;
  retryable: boolean;
};

export const INTERNAL_FAILURE: StreamFailure = {
  code: "ASSISTANT_INTERNAL",
  retryable: true,
};

/**
 * The event for a failed OpenRouter call, or null when `error` is not a
 * provider failure (an internal error, which the caller must not hide).
 */
export function providerFailure(error: unknown): StreamFailure | null {
  if (!(error instanceof OpenRouterError)) return null;
  return {
    code:
      error.code === "OPENROUTER_UNREACHABLE"
        ? "OPENROUTER_UNAVAILABLE"
        : error.code,
    retryable: error.retryable,
  };
}

/** The codes that mark the workspace's key in settings until an admin saves. */
export function providerErrorToRecord(
  code: AssistantStreamErrorCode,
): ProviderErrorCode | null {
  return code === "OPENROUTER_KEY_INVALID" || code === "OPENROUTER_CREDITS"
    ? code
    : null;
}
