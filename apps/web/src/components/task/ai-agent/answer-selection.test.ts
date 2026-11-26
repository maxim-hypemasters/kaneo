import { describe, expect, it } from "vite-plus/test";
import { buildAnswers, MAX_ANSWERS, OTHER_CHOICE } from "./answer-selection";

const question = (id: string, options: string[] = ["Yes", "No"]) => ({
  id,
  text: `Question ${id}?`,
  options,
  blocking: false,
});

describe("buildAnswers", () => {
  it("answers with the chosen option's text", () => {
    expect(
      buildAnswers([question("q1")], { q1: { choice: "1", other: "" } }),
    ).toEqual([{ questionId: "q1", answer: "No" }]);
  });

  it("uses the trimmed free text for Other", () => {
    expect(
      buildAnswers([question("q1")], {
        q1: { choice: OTHER_CHOICE, other: "  Only on Fridays " },
      }),
    ).toEqual([{ questionId: "q1", answer: "Only on Fridays" }]);
  });

  it("skips unanswered questions, blank Other text and vanished options", () => {
    expect(
      buildAnswers([question("q1"), question("q2"), question("q3")], {
        q2: { choice: OTHER_CHOICE, other: "   " },
        q3: { choice: "7", other: "" },
      }),
    ).toEqual([]);
  });

  it("keeps the agent's question order and ignores answers to removed questions", () => {
    expect(
      buildAnswers([question("q2"), question("q1")], {
        q1: { choice: "0", other: "" },
        q2: { choice: "1", other: "" },
        gone: { choice: "0", other: "" },
      }),
    ).toEqual([
      { questionId: "q2", answer: "No" },
      { questionId: "q1", answer: "Yes" },
    ]);
  });

  it("sends no more answers than the API accepts", () => {
    const questions = Array.from({ length: MAX_ANSWERS + 2 }, (_, index) =>
      question(`q${index}`),
    );
    const selections = Object.fromEntries(
      questions.map((item) => [item.id, { choice: "0", other: "" }]),
    );
    expect(buildAnswers(questions, selections)).toHaveLength(MAX_ANSWERS);
  });
});
