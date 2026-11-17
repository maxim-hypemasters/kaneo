import { describe, expect, it } from "vite-plus/test";
import { type BarKey, typesText } from "./types-text";

const key = (overrides: Partial<BarKey>): BarKey => ({
  key: "a",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  altGraph: false,
  mac: false,
  isComposing: false,
  ...overrides,
});

describe("typesText", () => {
  it("counts letters, digits, punctuation and other scripts", () => {
    for (const character of ["a", "W", "7", "?", "é", "ж", "😀"]) {
      expect(typesText(key({ key: character }))).toBe(true);
    }
  });

  it("counts characters made with AltGr", () => {
    expect(
      typesText(key({ key: "ą", ctrlKey: true, altKey: true, altGraph: true })),
    ).toBe(true);
  });

  it("counts characters made with Option on a Mac, and dead keys", () => {
    expect(typesText(key({ key: "@", altKey: true, mac: true }))).toBe(true);
    expect(typesText(key({ key: "Dead" }))).toBe(true);
    expect(typesText(key({ key: "Dead", altKey: true, mac: true }))).toBe(true);
  });

  it("ignores shortcuts and keys without a character", () => {
    for (const overrides of [
      { ctrlKey: true },
      { metaKey: true },
      { metaKey: true, mac: true },
      { ctrlKey: true, mac: true },
      { altKey: true },
      { key: "Enter" },
      { key: "Shift" },
      { key: "ArrowDown" },
      { key: " " },
      { key: "Tab" },
      { key: "Unidentified" },
    ]) {
      expect(typesText(key(overrides))).toBe(false);
    }
  });

  it("leaves keys to an IME", () => {
    expect(typesText(key({ isComposing: true }))).toBe(false);
    expect(typesText(key({ key: "Process", keyCode: 229 }))).toBe(false);
    expect(typesText(key({ key: "k", keyCode: 229 }))).toBe(false);
  });
});
