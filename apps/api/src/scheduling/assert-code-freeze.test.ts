import { describe, expect, it } from "vite-plus/test";
import { ApiError } from "../errors/api-error";
import { assertWithinCodeFreeze } from "./assert-code-freeze";

describe("applying release deadlines", () => {
  it("rejects the authoritative code-freeze warning set with a stable API code", () => {
    try {
      assertWithinCodeFreeze([{ taskId: "late", reason: "after_code_freeze" }]);
      throw new Error("Expected deadline rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 422,
        code: "PLAN_AFTER_CODE_FREEZE",
        issues: [{ path: "tasks.late", message: "Finishes after code freeze" }],
      });
    }
  });
  it("leaves other diagnostic behavior unchanged", () => {
    expect(() => assertWithinCodeFreeze([])).not.toThrow();
    expect(() =>
      assertWithinCodeFreeze([
        { taskId: "task", reason: "blocked_dependency" },
      ]),
    ).not.toThrow();
  });
});
