import type { QuestionInput } from "../kaneo/client";

const BLOCK = /```json\s*(\{[\s\S]*?"needs_input"[\s\S]*?\})\s*```/g;

function toQuestion(value: unknown): QuestionInput | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.text !== "string" || !item.text.trim()) return null;
  return {
    text: item.text.trim().slice(0, 500),
    options: Array.isArray(item.options)
      ? item.options
          .filter((option): option is string => typeof option === "string")
          .map((option) => option.trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, 4)
      : [],
    blocking: item.blocking !== false,
  };
}

/**
 * Splits Hermes's final reply into the pull request summary and any
 * questions it asked in a trailing needs_input block.
 */
export function parseNeedsInput(text: string): {
  summary: string;
  questions: QuestionInput[];
} {
  let questions: QuestionInput[] = [];
  const summary = text.replace(BLOCK, (_match, json: string) => {
    try {
      const parsed = JSON.parse(json) as { needs_input?: unknown };
      if (Array.isArray(parsed.needs_input))
        questions = parsed.needs_input
          .map(toQuestion)
          .filter((question): question is QuestionInput => question !== null)
          .slice(0, 8);
    } catch {}
    return "";
  });
  return { summary: summary.trim(), questions };
}
