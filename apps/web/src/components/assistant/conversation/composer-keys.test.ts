import { describe, expect, it } from "vite-plus/test";
import { type ComposerKey, composerKeyAction } from "./composer-keys";

const key = (overrides: Partial<ComposerKey>): ComposerKey => ({
  key: "Enter",
  shiftKey: false,
  altKey: false,
  isComposing: false,
  ...overrides,
});

describe("composerKeyAction", () => {
  it("sends on Enter", () => {
    expect(composerKeyAction(key({}), { streaming: false })).toBe("send");
  });

  it("adds a line on Shift+Enter and Alt+Enter", () => {
    expect(
      composerKeyAction(key({ shiftKey: true }), { streaming: false }),
    ).toBeNull();
    expect(
      composerKeyAction(key({ altKey: true }), { streaming: false }),
    ).toBeNull();
  });

  it("leaves Enter to an IME that is composing", () => {
    expect(
      composerKeyAction(key({ isComposing: true }), { streaming: false }),
    ).toBeNull();
    expect(
      composerKeyAction(key({ keyCode: 229 }), { streaming: false }),
    ).toBeNull();
    expect(
      composerKeyAction(key({ key: "Escape", isComposing: true }), {
        streaming: true,
      }),
    ).toBeNull();
  });

  it("stops a streaming answer on Escape", () => {
    expect(composerKeyAction(key({ key: "Escape" }), { streaming: true })).toBe(
      "stop",
    );
    expect(
      composerKeyAction(key({ key: "Escape" }), { streaming: false }),
    ).toBeNull();
  });

  it("ignores other keys", () => {
    expect(
      composerKeyAction(key({ key: "a" }), { streaming: true }),
    ).toBeNull();
  });
});
