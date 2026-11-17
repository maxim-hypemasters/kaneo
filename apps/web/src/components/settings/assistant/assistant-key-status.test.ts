import { describe, expect, it } from "vite-plus/test";
import {
  ASSISTANT_KEY_STATUS_DISPLAY,
  canShowKeyUsage,
  getAssistantKeyStatus,
  hasReadableKey,
} from "./assistant-key-status";

describe("getAssistantKeyStatus", () => {
  it("reports a missing key as not set up", () => {
    expect(getAssistantKeyStatus({ configured: false, keyState: null })).toBe(
      "not_configured",
    );
  });

  it("follows the saved key's state", () => {
    expect(getAssistantKeyStatus({ configured: true, keyState: "ok" })).toBe(
      "connected",
    );
    expect(
      getAssistantKeyStatus({ configured: true, keyState: "rejected" }),
    ).toBe("rejected");
    expect(
      getAssistantKeyStatus({ configured: true, keyState: "out_of_credits" }),
    ).toBe("out_of_credits");
    expect(
      getAssistantKeyStatus({ configured: true, keyState: "unreadable" }),
    ).toBe("unreadable");
  });

  it("has a badge and description for every status", () => {
    for (const display of Object.values(ASSISTANT_KEY_STATUS_DISPLAY)) {
      expect(display.labelKey).toMatch(/^settings:assistantPage\.status\./);
      expect(display.descriptionKey).toMatch(
        /^settings:assistantPage\.status\..+Description$/,
      );
    }
  });
});

describe("hasReadableKey", () => {
  it("keeps a saved key unless it can no longer be decrypted", () => {
    expect(hasReadableKey({ configured: false, keyState: null })).toBe(false);
    expect(hasReadableKey({ configured: true, keyState: "ok" })).toBe(true);
    expect(hasReadableKey({ configured: true, keyState: "rejected" })).toBe(
      true,
    );
    expect(hasReadableKey({ configured: true, keyState: "unreadable" })).toBe(
      false,
    );
  });
});

describe("canShowKeyUsage", () => {
  it("only asks OpenRouter about keys it accepts", () => {
    expect(canShowKeyUsage("connected")).toBe(true);
    expect(canShowKeyUsage("out_of_credits")).toBe(true);
    expect(canShowKeyUsage("rejected")).toBe(false);
    expect(canShowKeyUsage("unreadable")).toBe(false);
    expect(canShowKeyUsage("not_configured")).toBe(false);
  });
});
