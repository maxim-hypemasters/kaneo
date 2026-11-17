import { describe, expect, it } from "vite-plus/test";
import {
  keyStateFor,
  type StoredAssistantSettings,
  toAssistantSettings,
} from "./to-assistant-settings";

const stored: StoredAssistantSettings = {
  apiKeyHint: "…cdef",
  model: "anthropic/claude-haiku-5.5",
  allowDataCollection: true,
  lastErrorCode: "OPENROUTER_CREDITS",
  lastErrorAt: new Date("2026-11-16T10:00:00Z"),
  updatedAt: new Date("2026-11-15T09:30:00Z"),
  updatedBy: { id: "user-1", name: "Ada" },
};

describe("toAssistantSettings", () => {
  it("describes an unconfigured workspace with the default model", () => {
    expect(toAssistantSettings(null, false)).toEqual({
      configured: false,
      keyHint: null,
      keyState: null,
      model: "anthropic/claude-sonnet-5.5",
      defaultModel: "anthropic/claude-sonnet-5.5",
      allowDataCollection: false,
      lastError: null,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it("maps a saved key with ISO timestamps", () => {
    expect(toAssistantSettings(stored, true)).toEqual({
      configured: true,
      keyHint: "…cdef",
      keyState: "out_of_credits",
      model: "anthropic/claude-haiku-5.5",
      defaultModel: "anthropic/claude-sonnet-5.5",
      allowDataCollection: true,
      lastError: {
        code: "OPENROUTER_CREDITS",
        at: "2026-11-16T10:00:00.000Z",
      },
      updatedAt: "2026-11-15T09:30:00.000Z",
      updatedBy: { id: "user-1", name: "Ada" },
    });
  });

  it("drops a last error without a time", () => {
    expect(
      toAssistantSettings({ ...stored, lastErrorAt: null }, true).lastError,
    ).toBeNull();
  });
});

describe("keyStateFor", () => {
  it.each([
    [false, null, "unreadable"],
    [false, "OPENROUTER_KEY_INVALID", "unreadable"],
    [true, "OPENROUTER_KEY_INVALID", "rejected"],
    [true, "OPENROUTER_CREDITS", "out_of_credits"],
    [true, null, "ok"],
    [true, "SOMETHING_ELSE", "ok"],
  ] as const)("readable=%s, error=%s → %s", (readable, code, state) => {
    expect(keyStateFor(readable, code)).toBe(state);
  });
});
