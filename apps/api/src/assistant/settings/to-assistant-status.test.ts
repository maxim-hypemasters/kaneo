import { describe, expect, it } from "vite-plus/test";
import type { AssistantConfig } from "./load-assistant-config";
import { toAssistantStatus } from "./to-assistant-status";

const ready = (lastErrorCode: string | null): AssistantConfig => ({
  state: "ready",
  apiKey: "sk-or-v1-secret-value-0123456789",
  keyCiphertext: "sbx1:iv.tag.ct",
  model: "anthropic/claude-sonnet-5.5",
  allowDataCollection: false,
  lastErrorCode,
});

describe("toAssistantStatus", () => {
  it("is unavailable without a key", () => {
    expect(toAssistantStatus({ state: "not_configured" }, true)).toEqual({
      enabled: false,
      reason: "not_configured",
      model: null,
      canManage: true,
    });
  });

  it("is unavailable when the key cannot be decrypted", () => {
    expect(
      toAssistantStatus({ state: "unreadable", model: "x/y" }, false),
    ).toEqual({
      enabled: false,
      reason: "key_unreadable",
      model: "x/y",
      canManage: false,
    });
  });

  it.each([
    [null, null],
    ["OPENROUTER_KEY_INVALID", "key_rejected"],
    ["OPENROUTER_CREDITS", "out_of_credits"],
  ])("is enabled with last error %s → reason %s", (code, reason) => {
    expect(toAssistantStatus(ready(code), false)).toEqual({
      enabled: true,
      reason,
      model: "anthropic/claude-sonnet-5.5",
      canManage: false,
    });
  });

  it("never includes the key", () => {
    expect(JSON.stringify(toAssistantStatus(ready(null), true))).not.toContain(
      "sk-or",
    );
  });
});
