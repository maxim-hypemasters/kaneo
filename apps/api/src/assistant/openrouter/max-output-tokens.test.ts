import { describe, expect, it } from "vite-plus/test";
import { MAX_OUTPUT_TOKENS } from "../constants";
import {
  estimateTokens,
  MIN_OUTPUT_TOKENS,
  maxOutputTokens,
} from "./max-output-tokens";

const limits = (
  contextLength: number | null,
  maxCompletionTokens: number | null,
) => ({ contextLength, maxCompletionTokens });

describe("estimateTokens", () => {
  it("counts about 3.5 characters per token, rounding up", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(7)).toBe(2);
    expect(estimateTokens(8)).toBe(3);
    expect(estimateTokens(350_000)).toBe(100_000);
  });
});

describe("maxOutputTokens", () => {
  it("asks for the default when the limits are unknown", () => {
    expect(maxOutputTokens(null, 1_000_000)).toBe(MAX_OUTPUT_TOKENS);
    expect(maxOutputTokens(limits(null, null), 1_000_000)).toBe(
      MAX_OUTPUT_TOKENS,
    );
  });

  it("keeps the default when a large window has room", () => {
    expect(maxOutputTokens(limits(1_000_000, 128_000), 70_000)).toBe(
      MAX_OUTPUT_TOKENS,
    );
  });

  it("never asks for more than the model's completion limit", () => {
    expect(maxOutputTokens(limits(200_000, 8_192), 0)).toBe(8_192);
    // The completion limit holds even below the context cut's floor.
    expect(maxOutputTokens(limits(200_000, 512), 0)).toBe(512);
    expect(maxOutputTokens(limits(null, 4_096), 0)).toBe(4_096);
  });

  it("leaves the request its share of the context window", () => {
    // 350,000 characters are about 100,000 tokens.
    expect(maxOutputTokens(limits(120_000, null), 350_000)).toBe(20_000);
    expect(maxOutputTokens(limits(120_000, 16_000), 350_000)).toBe(16_000);
  });

  it(`never cuts below ${MIN_OUTPUT_TOKENS} for a full window`, () => {
    expect(maxOutputTokens(limits(100_000, null), 350_000)).toBe(
      MIN_OUTPUT_TOKENS,
    );
    expect(maxOutputTokens(limits(8_000, null), 1_000_000)).toBe(
      MIN_OUTPUT_TOKENS,
    );
  });
});
