import type { ReadinessQuestion, ReadinessVerdict } from "./agent-types";

/**
 * Kaneo, not the model, decides the verdict: the project's threshold applies,
 * and an open blocking question always holds the task back.
 */
export function readinessVerdict(input: {
  score: number;
  threshold: number;
  questions: ReadonlyArray<Pick<ReadinessQuestion, "blocking">>;
}): ReadinessVerdict {
  if (input.questions.some((question) => question.blocking))
    return "needs_clarification";
  if (input.score >= input.threshold) return "ready";
  return input.questions.length > 0 ? "needs_clarification" : "not_ready";
}
