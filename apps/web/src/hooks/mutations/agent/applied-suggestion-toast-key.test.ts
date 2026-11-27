import { describe, expect, it } from "vite-plus/test";
import { appliedSuggestionToastKey } from "./applied-suggestion-toast-key";

const result = { assigneeChanged: false, datesChanged: false };

describe("appliedSuggestionToastKey", () => {
  it("says what each kind set", () => {
    expect(appliedSuggestionToastKey({ ...result, kind: "description" })).toBe(
      "tasks:aiAgent.toast.applied",
    );
    expect(appliedSuggestionToastKey({ ...result, kind: "assignee" })).toBe(
      "tasks:aiAgent.toast.appliedField.assignee",
    );
    expect(appliedSuggestionToastKey({ ...result, kind: "test_cases" })).toBe(
      "tasks:aiAgent.toast.appliedField.testCases",
    );
  });

  it("says when an estimate also set dates, and assigned someone", () => {
    expect(appliedSuggestionToastKey({ ...result, kind: "estimate" })).toBe(
      "tasks:aiAgent.toast.appliedField.estimate",
    );
    expect(
      appliedSuggestionToastKey({
        kind: "estimate",
        assigneeChanged: false,
        datesChanged: true,
      }),
    ).toBe("tasks:aiAgent.toast.appliedField.estimateWithDates");
    expect(
      appliedSuggestionToastKey({
        kind: "estimate",
        assigneeChanged: true,
        datesChanged: true,
      }),
    ).toBe("tasks:aiAgent.toast.appliedField.estimateWithAssignee");
  });
});
