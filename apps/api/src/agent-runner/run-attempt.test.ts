import { describe, expect, it } from "vite-plus/test";
import { parseRunAttempt } from "./run-attempt";

describe("parseRunAttempt", () => {
  it("reads a positive attempt number", () => {
    expect(parseRunAttempt("1")).toBe(1);
    expect(parseRunAttempt(" 2 ")).toBe(2);
  });

  it("refuses a missing or malformed header", () => {
    for (const value of [undefined, "", "0", "-1", "1.5", "2abc", "01", "1e3"])
      expect(parseRunAttempt(value)).toBeNull();
  });
});
