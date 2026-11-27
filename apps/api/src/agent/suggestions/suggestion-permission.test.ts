import { describe, expect, it } from "vite-plus/test";
import { suggestionPermission } from "./suggestion-permission";

const testCases = {
  kind: "test_cases" as const,
  id: "t",
  milestoneId: null,
  cases: [{ title: "A", steps: null, expectedResult: null }],
  reason: "",
};

describe("suggestionPermission", () => {
  it("needs task:assign to assign someone", () => {
    expect(
      suggestionPermission({
        kind: "assignee",
        id: "a",
        userId: "u1",
        reason: "",
      }),
    ).toEqual({ task: ["assign"] });
  });

  it("needs test_case:create and read access to the linked work", () => {
    expect(
      suggestionPermission({ ...testCases, target: "bug" as const }),
    ).toEqual({
      test_case: ["create"],
      bug: ["read"],
    });
    expect(
      suggestionPermission({
        ...testCases,
        target: "milestone" as const,
        milestoneId: "m1",
      }),
    ).toEqual({ test_case: ["create"], milestone: ["read"] });
  });

  it("needs nothing more for fields any editor may set", () => {
    expect(
      suggestionPermission({ id: "d", title: "T", markdown: "M" }),
    ).toBeNull();
    expect(
      suggestionPermission({
        kind: "priority",
        id: "p",
        priority: "high",
        reason: "",
      }),
    ).toBeNull();
    expect(
      suggestionPermission({
        kind: "estimate",
        id: "e",
        minutes: 60,
        reason: "",
      }),
    ).toBeNull();
  });
});
