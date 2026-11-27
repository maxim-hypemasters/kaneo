import { describe, expect, it } from "vite-plus/test";
import { computeInputHash } from "./compute-input-hash";

const base = {
  type: "bug",
  title: "Login fails",
  description: "Steps: open /login",
  clarifications: [{ question: "Which browser?", answer: "Firefox" }],
};

describe("computeInputHash", () => {
  it("is stable for the same input and ignores surrounding whitespace", () => {
    expect(computeInputHash(base)).toBe(
      computeInputHash({ ...base, title: "  Login fails \n" }),
    );
  });

  it("changes when the type, text or answers change", () => {
    const hash = computeInputHash(base);
    expect(computeInputHash({ ...base, type: "task" })).not.toBe(hash);
    expect(computeInputHash({ ...base, description: null })).not.toBe(hash);
    expect(
      computeInputHash({
        ...base,
        clarifications: [{ question: "Which browser?", answer: "Safari" }],
      }),
    ).not.toBe(hash);
  });

  // Stored assessments compare against this digest; a change marks every
  // one of them Outdated.
  it("keeps the digest stored assessments were made with", () => {
    expect(computeInputHash(base)).toBe(
      "38408c23095b13b6cdb44b02ad573435706d0d620cfb15404019597b041935b3",
    );
  });

  it("treats a missing description like an empty one", () => {
    expect(computeInputHash({ ...base, description: null })).toBe(
      computeInputHash({ ...base, description: "" }),
    );
  });
});
