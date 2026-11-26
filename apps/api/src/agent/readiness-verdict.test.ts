import { describe, expect, it } from "vite-plus/test";
import { readinessVerdict } from "./readiness-verdict";

describe("readinessVerdict", () => {
  it("is ready at or above the threshold with no blocking question", () => {
    expect(readinessVerdict({ score: 80, threshold: 80, questions: [] })).toBe(
      "ready",
    );
    expect(
      readinessVerdict({
        score: 90,
        threshold: 80,
        questions: [{ blocking: false }],
      }),
    ).toBe("ready");
  });

  it("needs clarification while a blocking question is open", () => {
    expect(
      readinessVerdict({
        score: 95,
        threshold: 80,
        questions: [{ blocking: true }],
      }),
    ).toBe("needs_clarification");
  });

  it("below the threshold, asks when it has questions and is not ready otherwise", () => {
    expect(
      readinessVerdict({
        score: 40,
        threshold: 80,
        questions: [{ blocking: false }],
      }),
    ).toBe("needs_clarification");
    expect(readinessVerdict({ score: 40, threshold: 80, questions: [] })).toBe(
      "not_ready",
    );
  });
});
