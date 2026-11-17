import type { AssistantStatus } from "../response";
import type { AssistantConfig } from "./load-assistant-config";

/**
 * What every member may know about the assistant. A key OpenRouter rejected
 * last time stays enabled with a reason, so the next request can still try.
 */
export function toAssistantStatus(
  config: AssistantConfig,
  canManage: boolean,
): AssistantStatus {
  if (config.state === "not_configured") {
    return { enabled: false, reason: "not_configured", model: null, canManage };
  }
  if (config.state === "unreadable") {
    return {
      enabled: false,
      reason: "key_unreadable",
      model: config.model,
      canManage,
    };
  }
  const reason =
    config.lastErrorCode === "OPENROUTER_KEY_INVALID"
      ? "key_rejected"
      : config.lastErrorCode === "OPENROUTER_CREDITS"
        ? "out_of_credits"
        : null;
  return { enabled: true, reason, model: config.model, canManage };
}
