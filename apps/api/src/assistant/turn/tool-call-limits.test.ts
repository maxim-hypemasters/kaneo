import { describe, expect, it } from "vite-plus/test";
import { MAX_TOOL_CALLS_PER_STEP } from "../constants";
import {
  limitToolCalls,
  STEP_LIMIT_REFUSAL,
  TURN_LIMIT_REFUSAL,
} from "./tool-call-limits";

const calls = (count: number) =>
  Array.from({ length: count }, (_, index) => `call-${index}`);

describe("limitToolCalls", () => {
  it("runs every call within both limits", () => {
    expect(limitToolCalls(calls(3), 40)).toEqual([
      { call: "call-0", refusal: null },
      { call: "call-1", refusal: null },
      { call: "call-2", refusal: null },
    ]);
  });

  it("refuses calls past the per-step limit, keeping their order", () => {
    const planned = limitToolCalls(calls(MAX_TOOL_CALLS_PER_STEP + 2), 40);
    expect(planned).toHaveLength(MAX_TOOL_CALLS_PER_STEP + 2);
    expect(planned.map((item) => item.call)).toEqual(
      calls(MAX_TOOL_CALLS_PER_STEP + 2),
    );
    expect(planned.filter((item) => item.refusal === null)).toHaveLength(
      MAX_TOOL_CALLS_PER_STEP,
    );
    expect(planned.at(-1)?.refusal).toBe(STEP_LIMIT_REFUSAL);
  });

  it("refuses calls past what is left of the turn", () => {
    expect(limitToolCalls(calls(3), 1).map((item) => item.refusal)).toEqual([
      null,
      TURN_LIMIT_REFUSAL,
      TURN_LIMIT_REFUSAL,
    ]);
  });

  it("refuses everything once the turn's budget is spent", () => {
    for (const budget of [0, -3]) {
      expect(
        limitToolCalls(calls(2), budget).map((item) => item.refusal),
      ).toEqual([TURN_LIMIT_REFUSAL, TURN_LIMIT_REFUSAL]);
    }
  });

  it("returns nothing for no calls", () => {
    expect(limitToolCalls([], 40)).toEqual([]);
  });
});
