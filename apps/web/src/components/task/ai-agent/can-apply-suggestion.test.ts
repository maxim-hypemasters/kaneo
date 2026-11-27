import { describe, expect, it } from "vite-plus/test";
import { canApplySuggestion } from "./can-apply-suggestion";

const all = { canUpdate: true, canAssign: true, canCreateTestCases: true };

describe("canApplySuggestion", () => {
  it("lets people who can update the task apply field values", () => {
    for (const kind of [
      "priority",
      "feature",
      "milestone",
      "release",
      "estimate",
      "description",
    ] as const)
      expect(
        canApplySuggestion(kind, {
          ...all,
          canAssign: false,
          canCreateTestCases: false,
        }),
      ).toBe(true);
  });

  it("asks for task:assign to assign someone", () => {
    expect(canApplySuggestion("assignee", all)).toBe(true);
    expect(canApplySuggestion("assignee", { ...all, canAssign: false })).toBe(
      false,
    );
  });

  it("asks for test case creation to create test cases", () => {
    expect(canApplySuggestion("test_cases", all)).toBe(true);
    expect(
      canApplySuggestion("test_cases", { ...all, canCreateTestCases: false }),
    ).toBe(false);
  });

  it("applies nothing for people who can't update the task", () => {
    expect(canApplySuggestion("priority", { ...all, canUpdate: false })).toBe(
      false,
    );
    expect(canApplySuggestion("assignee", { ...all, canUpdate: false })).toBe(
      false,
    );
  });
});
