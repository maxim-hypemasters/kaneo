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

  it("treats a missing description like an empty one", () => {
    expect(computeInputHash({ ...base, description: null })).toBe(
      computeInputHash({ ...base, description: "" }),
    );
  });
});
