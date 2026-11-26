import { describe, expect, it } from "vite-plus/test";
import { createRedactor } from "./redact";

describe("createRedactor", () => {
  it("removes configured secrets and token-shaped strings", () => {
    const redact = createRedactor(["supersecretvalue", null, "short"]);
    expect(
      redact(
        "a supersecretvalue b ghp_abcdefghijklmnopqrstuvwxyz0123 kar_abcdefghijklmnopqrstuvwx short",
      ),
    ).toBe("a [redacted] b [redacted] [redacted] short");
  });

  it("removes OpenRouter-style keys", () => {
    expect(createRedactor([])("key sk-or-v1-0123456789abcdefghij")).toBe(
      "key [redacted]",
    );
  });
});
