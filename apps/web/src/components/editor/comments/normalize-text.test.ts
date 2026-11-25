import { describe, expect, it } from "vite-plus/test";
import { isWhitespace, normalizeText } from "./normalize-text";

describe("normalizeText", () => {
  it("collapses every kind of whitespace run to one space and trims", () => {
    expect(normalizeText("  one  two\n\n\tthree \r\n")).toBe("one two three");
    expect(normalizeText(" \n ")).toBe("");
  });

  it("treats non-breaking spaces and line breaks as whitespace", () => {
    expect([" ", "\n", "\t", " "].every(isWhitespace)).toBe(true);
    expect(isWhitespace("a")).toBe(false);
  });
});
