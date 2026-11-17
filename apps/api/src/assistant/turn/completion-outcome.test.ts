import { describe, expect, it } from "vite-plus/test";
import type { CompletionResult } from "../openrouter/types";
import { completionOutcome, partialAnswer } from "./completion-outcome";

function result(overrides: Partial<CompletionResult>): CompletionResult {
  return {
    content: "",
    toolCalls: [],
    reasoningDetails: null,
    finishReason: "stop",
    usage: null,
    ...overrides,
  };
}

const call = { id: "call_1", name: "list_projects", arguments: "{}" };

describe("completionOutcome", () => {
  it("ends the turn with a text answer", () => {
    expect(completionOutcome(result({ content: "Two projects." }))).toEqual({
      content: "Two projects.",
      status: "complete",
      toolCalls: [],
      end: { type: "done", truncated: false },
    });
  });

  it("keeps an answer cut at the token limit and marks it truncated", () => {
    expect(
      completionOutcome(result({ content: "Long", finishReason: "length" })),
    ).toMatchObject({
      status: "complete",
      end: { type: "done", truncated: true },
    });
  });

  it("runs tool calls, with or without text", () => {
    for (const content of ["", "Let me look."]) {
      expect(
        completionOutcome(
          result({ content, toolCalls: [call], finishReason: "tool_calls" }),
        ),
      ).toEqual({ content, status: "complete", toolCalls: [call], end: null });
    }
  });

  it("stores tool calls with names and ids a provider accepts on replay", () => {
    const outcome = completionOutcome(
      result({
        toolCalls: [call, { ...call, name: "functions.list projects" }],
        finishReason: "tool_calls",
      }),
    );
    expect(outcome.toolCalls[0]).toEqual(call);
    expect(outcome.toolCalls[1]).toMatchObject({
      id: expect.stringMatching(/^call_[0-9a-f]{24}$/),
      name: "functions_list_projects",
    });
  });

  it("runs calls cut at the token limit, so the model gets their errors", () => {
    const invalid = { ...call, arguments: "{}", invalid: true };
    expect(
      completionOutcome(
        result({ toolCalls: [invalid], finishReason: "length" }),
      ),
    ).toMatchObject({ status: "complete", toolCalls: [invalid], end: null });
  });

  it("saves an empty reply as interrupted and ends with a retryable error", () => {
    expect(completionOutcome(result({ content: " \n" }))).toEqual({
      content: " \n",
      status: "interrupted",
      toolCalls: [],
      end: { type: "error", code: "OPENROUTER_UNAVAILABLE", retryable: true },
    });
  });

  it("never runs or replays a reply moderation cut off", () => {
    expect(
      completionOutcome(
        result({
          content: "Partial",
          toolCalls: [call],
          finishReason: "content_filter",
        }),
      ),
    ).toEqual({
      content: "Partial",
      status: "interrupted",
      toolCalls: [],
      end: {
        type: "error",
        code: "OPENROUTER_CONTENT_FILTERED",
        retryable: false,
      },
    });
  });

  it("drops NUL characters Postgres can't store", () => {
    expect(completionOutcome(result({ content: "a\u0000b" })).content).toBe(
      "ab",
    );
  });
});

describe("partialAnswer", () => {
  it("keeps streamed text and drops blank text", () => {
    expect(partialAnswer("Half an ans")).toBe("Half an ans");
    expect(partialAnswer("x\u0000")).toBe("x");
    expect(partialAnswer("")).toBeNull();
    expect(partialAnswer(" \n")).toBeNull();
    expect(partialAnswer("\u0000")).toBeNull();
  });
});
