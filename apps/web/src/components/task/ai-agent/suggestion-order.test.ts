import { describe, expect, it } from "vite-plus/test";
import {
  assigneeSuggestion,
  descriptionSuggestion,
  estimateSuggestion,
  featureSuggestion,
  milestoneSuggestion,
  prioritySuggestion,
  releaseSuggestion,
  testCasesSuggestion,
} from "./suggestion-fixtures";
import { orderSuggestions } from "./suggestion-order";

describe("orderSuggestions", () => {
  it("lists fields, then test cases, then description additions", () => {
    const ordered = orderSuggestions([
      descriptionSuggestion,
      testCasesSuggestion(),
      estimateSuggestion(),
      releaseSuggestion,
      milestoneSuggestion,
      featureSuggestion,
      prioritySuggestion,
      assigneeSuggestion,
    ]);

    expect(ordered.map(({ kind }) => kind)).toEqual([
      "assignee",
      "priority",
      "feature",
      "milestone",
      "release",
      "estimate",
      "test_cases",
      "description",
    ]);
  });

  it("keeps the order of suggestions of one kind", () => {
    const second = { ...descriptionSuggestion, id: "second" };
    expect(
      orderSuggestions([descriptionSuggestion, assigneeSuggestion, second]).map(
        ({ id }) => id,
      ),
    ).toEqual([assigneeSuggestion.id, descriptionSuggestion.id, "second"]);
  });
});
