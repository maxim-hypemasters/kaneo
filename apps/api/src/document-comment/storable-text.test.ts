import { describe, expect, it } from "vite-plus/test";
import { isStorableText } from "./storable-text";

describe("isStorableText", () => {
  it("accepts ordinary text, whitespace and whole surrogate pairs", () => {
    for (const text of ["", " quoted text\n", "naïve café", "ship it 🚀", "𝒳"])
      expect(isStorableText(text), JSON.stringify(text)).toBe(true);
  });

  it("refuses NUL anywhere in the text", () => {
    expect(isStorableText("\u0000")).toBe(false);
    expect(isStorableText("before\u0000after")).toBe(false);
  });

  it("refuses half of a surrogate pair", () => {
    const rocket = "🚀";
    expect(isStorableText(rocket.slice(0, 1))).toBe(false);
    expect(isStorableText(rocket.slice(1))).toBe(false);
    expect(isStorableText(`cut ${rocket.slice(0, 1)}`)).toBe(false);
    expect(isStorableText(`${rocket.slice(1)} cut`)).toBe(false);
    expect(isStorableText(`${rocket.slice(0, 1)}${rocket}`)).toBe(false);
  });
});
