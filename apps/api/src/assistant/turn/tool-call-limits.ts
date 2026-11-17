import { MAX_TOOL_CALLS_PER_STEP, MAX_TOOL_CALLS_PER_TURN } from "../constants";

export const STEP_LIMIT_REFUSAL = `Not run: at most ${MAX_TOOL_CALLS_PER_STEP} tool calls run per step. Call it again in your next step if you still need it.`;
export const TURN_LIMIT_REFUSAL = `Not run: this answer already used its ${MAX_TOOL_CALLS_PER_TURN} tool calls. Answer with what you have.`;

export type PlannedToolCall<T> = { call: T; refusal: string | null };

/**
 * Which of a step's calls may run: the first `perStep`, as long as the
 * turn's remaining `turnBudget` lasts. Every other call keeps its place with
 * a refusal, so the model still gets exactly one result per call.
 */
export function limitToolCalls<T>(
  calls: readonly T[],
  turnBudget: number,
  perStep: number = MAX_TOOL_CALLS_PER_STEP,
): PlannedToolCall<T>[] {
  const budget = Math.max(0, turnBudget);
  return calls.map((call, index) => ({
    call,
    refusal:
      index >= budget
        ? TURN_LIMIT_REFUSAL
        : index >= perStep
          ? STEP_LIMIT_REFUSAL
          : null,
  }));
}
