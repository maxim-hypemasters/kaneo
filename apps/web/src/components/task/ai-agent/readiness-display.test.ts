import { describe, expect, it } from "vite-plus/test";
import { filledSegments, verdictDisplay } from "./readiness-display";

describe("verdictDisplay", () => {
  it("colours each verdict and names it", () => {
    expect(verdictDisplay("not_ready")).toEqual({
      tone: "error",
      labelKey: "tasks:aiAgent.verdict.notReady",
    });
    expect(verdictDisplay("needs_clarification").tone).toBe("warning");
    expect(verdictDisplay("ready")).toEqual({
      tone: "success",
      labelKey: "tasks:aiAgent.verdict.ready",
    });
  });
});

describe("filledSegments", () => {
  it("fills segments in proportion to the score", () => {
    expect(filledSegments(0, 10)).toBe(0);
    expect(filledSegments(44, 10)).toBe(4);
    expect(filledSegments(45, 10)).toBe(5);
    expect(filledSegments(100, 10)).toBe(10);
  });

  it("clamps scores outside 0–100", () => {
    expect(filledSegments(-5, 10)).toBe(0);
    expect(filledSegments(140, 10)).toBe(10);
    expect(filledSegments(Number.NaN, 10)).toBe(0);
  });
});
