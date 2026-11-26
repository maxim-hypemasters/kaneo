import { describe, expect, it } from "vite-plus/test";
import { mergeQuestions } from "./merge-questions";

const q = (id: string, text: string) => ({
  id,
  text,
  options: [],
  blocking: true,
});

describe("mergeQuestions", () => {
  it("appends new questions and skips duplicates by text", () => {
    expect(
      mergeQuestions(
        [q("a", "Which endpoint?")],
        [q("b", " which endpoint? "), q("c", "Keep the old API?")],
      ).map((question) => question.id),
    ).toEqual(["a", "c"]);
  });
});
