import { describe, expect, it } from "vite-plus/test";
import { estimateToSeconds, formatEstimate } from "./effort";

describe("shorthand effort", () => {
  it.each([
    ["1d", 28_800],
    ["4h", 14_400],
    ["3w", 432_000],
    ["1m", 60],
    ["1.5h", 5400],
    ["0.25d", 7200],
    [".5w", 72_000],
    ["1d4h", 43_200],
    ["1w 2d 3h 15m", 213_300],
    [" 1 D 4 H ", 43_200],
    ["30m 1h", 5400],
  ])("converts %s to canonical whole-minute seconds", (input, seconds) => {
    expect(estimateToSeconds(input)).toBe(seconds);
  });

  it("clears only blank input", () => {
    expect(estimateToSeconds("")).toBeNull();
    expect(estimateToSeconds("   ")).toBeNull();
  });

  it.each([
    "0h",
    "-1d",
    "+1h",
    "4",
    "abc",
    "Infinityh",
    "1e3h",
    "0.001h",
    "0.5m",
    "1d2d",
    "1h+2m",
    "1h extra",
    "1 2h",
    "1000000000w",
    "1h".repeat(51),
  ])("rejects invalid, sub-minute or overflowing %s", (input) => {
    expect(estimateToSeconds(input)).toBeUndefined();
  });

  it.each([
    [28_800, "1d"],
    [144_000, "1w"],
    [43_200, "1d 4h"],
    [5400, "1h 30m"],
    [60, "1m"],
    [432_000, "3w"],
  ])("formats %i saved seconds as %s", (seconds, label) => {
    expect(formatEstimate(seconds)).toBe(label);
  });

  it("preserves existing canonical effort without project conversion settings", () => {
    expect(formatEstimate(3600 * 6)).toBe("6h");
    expect(formatEstimate(3600 * 8)).toBe("1d");
    expect(formatEstimate(null)).toBe("");
  });

  it("roundtrips every minute, including the largest supported estimate", () => {
    for (const seconds of [60, 5400, 28_800, 43_200, 144_000, 2_147_483_640])
      expect(estimateToSeconds(formatEstimate(seconds))).toBe(seconds);
  });
});
