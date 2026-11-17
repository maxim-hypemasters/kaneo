import { expect, it } from "vite-plus/test";
import { isLongText, LONG_TEXT_CHARS, LONG_TEXT_LINES } from "./is-long-text";

it("folds text with many lines or many characters", () => {
  expect(isLongText("Short note")).toBe(false);
  expect(isLongText(Array(LONG_TEXT_LINES).fill("line").join("\n"))).toBe(
    false,
  );
  expect(
    isLongText(
      Array(LONG_TEXT_LINES + 1)
        .fill("line")
        .join("\n"),
    ),
  ).toBe(true);
  expect(isLongText("x".repeat(LONG_TEXT_CHARS))).toBe(false);
  expect(isLongText("x".repeat(LONG_TEXT_CHARS + 1))).toBe(true);
});
