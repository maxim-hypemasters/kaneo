import type { StatusTone } from "@/components/settings/status-badge";
import type { AssistantSettings } from "@/fetchers/assistant/get-assistant-settings";

export type AssistantKeyStatus =
  | "connected"
  | "not_configured"
  | "rejected"
  | "out_of_credits"
  | "unreadable";

type KeyFacts = Pick<AssistantSettings, "configured" | "keyState">;

export function getAssistantKeyStatus(settings: KeyFacts): AssistantKeyStatus {
  if (!settings.configured) return "not_configured";
  switch (settings.keyState) {
    case "rejected":
      return "rejected";
    case "out_of_credits":
      return "out_of_credits";
    case "unreadable":
      return "unreadable";
    default:
      return "connected";
  }
}

// A saved key that can still be decrypted; leaving the key field blank then
// keeps it. An unreadable key (AUTH_SECRET changed) must be entered again.
export function hasReadableKey(settings: KeyFacts): boolean {
  return settings.configured && settings.keyState !== "unreadable";
}

// OpenRouter answers usage only for a key it accepts. A rejected key would
// just fail again, and an unreadable one can't be sent.
export function canShowKeyUsage(status: AssistantKeyStatus): boolean {
  return status === "connected" || status === "out_of_credits";
}

export const ASSISTANT_KEY_STATUS_DISPLAY: Record<
  AssistantKeyStatus,
  { tone: StatusTone; labelKey: string; descriptionKey: string }
> = {
  connected: {
    tone: "success",
    labelKey: "settings:assistantPage.status.connected",
    descriptionKey: "settings:assistantPage.status.connectedDescription",
  },
  not_configured: {
    tone: "neutral",
    labelKey: "settings:assistantPage.status.notConfigured",
    descriptionKey: "settings:assistantPage.status.notConfiguredDescription",
  },
  rejected: {
    tone: "destructive",
    labelKey: "settings:assistantPage.status.rejected",
    descriptionKey: "settings:assistantPage.status.rejectedDescription",
  },
  out_of_credits: {
    tone: "warning",
    labelKey: "settings:assistantPage.status.outOfCredits",
    descriptionKey: "settings:assistantPage.status.outOfCreditsDescription",
  },
  unreadable: {
    tone: "warning",
    labelKey: "settings:assistantPage.status.unreadable",
    descriptionKey: "settings:assistantPage.status.unreadableDescription",
  },
};
