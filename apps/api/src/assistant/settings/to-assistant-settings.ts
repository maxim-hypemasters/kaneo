import { DEFAULT_ASSISTANT_MODEL } from "../constants";
import type { AssistantKeyState, AssistantSettings } from "../response";

/** The settings row's non-secret columns, with who last saved it. */
export type StoredAssistantSettings = {
  apiKeyHint: string;
  model: string;
  allowDataCollection: boolean;
  lastErrorCode: string | null;
  lastErrorAt: Date | null;
  updatedAt: Date;
  updatedBy: { id: string; name: string } | null;
};

export function keyStateFor(
  keyReadable: boolean,
  lastErrorCode: string | null,
): Exclude<AssistantKeyState, null> {
  if (!keyReadable) return "unreadable";
  if (lastErrorCode === "OPENROUTER_KEY_INVALID") return "rejected";
  if (lastErrorCode === "OPENROUTER_CREDITS") return "out_of_credits";
  return "ok";
}

/** The admin view of the settings; `stored` is null when no key is saved. */
export function toAssistantSettings(
  stored: StoredAssistantSettings | null,
  keyReadable: boolean,
): AssistantSettings {
  if (!stored) {
    return {
      configured: false,
      keyHint: null,
      keyState: null,
      model: DEFAULT_ASSISTANT_MODEL,
      defaultModel: DEFAULT_ASSISTANT_MODEL,
      allowDataCollection: false,
      lastError: null,
      updatedAt: null,
      updatedBy: null,
    };
  }
  return {
    configured: true,
    keyHint: stored.apiKeyHint,
    keyState: keyStateFor(keyReadable, stored.lastErrorCode),
    model: stored.model,
    defaultModel: DEFAULT_ASSISTANT_MODEL,
    allowDataCollection: stored.allowDataCollection,
    lastError:
      stored.lastErrorCode && stored.lastErrorAt
        ? {
            code: stored.lastErrorCode,
            at: stored.lastErrorAt.toISOString(),
          }
        : null,
    updatedAt: stored.updatedAt.toISOString(),
    updatedBy: stored.updatedBy,
  };
}
