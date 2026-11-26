import type { AgentQuestion } from "@/fetchers/agent/get-task-agent";
import type { TaskAgentAnswer } from "@/fetchers/agent/submit-task-agent-answers";

/** Radio value of the free-text answer; options use their index. */
export const OTHER_CHOICE = "other";
// The API accepts at most this many answers per request.
export const MAX_ANSWERS = 8;

export type AnswerSelection = { choice: string; other: string };
export type AnswerSelections = Record<string, AnswerSelection>;

function answerFor(
  question: AgentQuestion,
  selection: AnswerSelection | undefined,
): string {
  if (!selection) return "";
  if (selection.choice === OTHER_CHOICE) return selection.other.trim();
  return question.options[Number(selection.choice)]?.trim() ?? "";
}

/** The answered questions, in the agent's order, ready to submit. */
export function buildAnswers(
  questions: readonly AgentQuestion[],
  selections: AnswerSelections,
): TaskAgentAnswer[] {
  return questions
    .map((question) => ({
      questionId: question.id,
      answer: answerFor(question, selections[question.id]),
    }))
    .filter((item) => item.answer.length > 0)
    .slice(0, MAX_ANSWERS);
}
