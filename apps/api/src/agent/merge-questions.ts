import type { ReadinessQuestion } from "./agent-types";

const key = (text: string) => text.trim().toLowerCase();

/** Adds questions a run raised, skipping ones already open with the same text. */
export function mergeQuestions(
  existing: readonly ReadinessQuestion[],
  incoming: readonly ReadinessQuestion[],
): ReadinessQuestion[] {
  const seen = new Set(existing.map((question) => key(question.text)));
  const merged = [...existing];
  for (const question of incoming) {
    if (seen.has(key(question.text))) continue;
    seen.add(key(question.text));
    merged.push(question);
  }
  return merged;
}
