import { describe, expect, it } from "vite-plus/test";
import { isResumable, type ResumableRow } from "./is-resumable";

const userRow: ResumableRow = {
  role: "user",
  status: "complete",
  toolCalls: null,
};
const answer: ResumableRow = {
  role: "assistant",
  status: "complete",
  toolCalls: null,
};
const step: ResumableRow = {
  role: "assistant",
  status: "complete",
  toolCalls: [{ id: "c1", name: "get_task", arguments: "{}" }],
};
const result: ResumableRow = {
  role: "tool",
  status: "complete",
  toolCalls: null,
};

describe("isResumable", () => {
  it("is false for an empty chat", () => {
    expect(isResumable([], 0)).toBe(false);
  });

  it("is false after a final answer", () => {
    expect(isResumable([userRow, step, result, answer], 0)).toBe(false);
  });

  it("is true after tool results", () => {
    expect(isResumable([userRow, step, result], 0)).toBe(true);
  });

  it("is true after a user message whose turn failed", () => {
    expect(isResumable([userRow, answer, userRow], 0)).toBe(true);
  });

  it("is true after an interrupted answer", () => {
    expect(
      isResumable([userRow, { ...answer, status: "interrupted" }], 0),
    ).toBe(true);
  });

  it("is true after a step whose results never arrived", () => {
    expect(isResumable([userRow, step], 0)).toBe(true);
  });

  it("is false while anything is pending", () => {
    expect(isResumable([userRow, step, result], 1)).toBe(false);
    expect(isResumable([userRow], 2)).toBe(false);
  });
});
