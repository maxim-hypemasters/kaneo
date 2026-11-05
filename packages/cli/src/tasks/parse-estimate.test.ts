import { Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { parseEstimateSeconds } from "./parse-estimate.js";

describe("parseEstimateSeconds", () => {
  it("keeps canonical effort independent of project day length", () => {
    expect(Result.getOrThrow(parseEstimateSeconds("5400"))).toBe(5400);
    expect(Result.getOrThrow(parseEstimateSeconds("none"))).toBeNull();
  });
  it.each(["0", "-60", "1.5", "61", "Infinity", "tomorrow", "2147483641"])(
    "rejects invalid estimate %s",
    (value) => {
      expect(Result.isFailure(parseEstimateSeconds(value))).toBe(true);
    },
  );
});
