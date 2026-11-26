import { describe, expect, it } from "vite-plus/test";
import { parseNeedsInput } from "./parse-needs-input";

describe("parseNeedsInput", () => {
  it("keeps a plain summary", () => {
    expect(parseNeedsInput("Fixed the form.\n")).toEqual({
      summary: "Fixed the form.",
      questions: [],
    });
  });

  it("extracts questions and removes the block from the summary", () => {
    const text = [
      "I found two login forms.",
      "```json",
      '{"needs_input": [{"text": "Which form?", "options": ["Both", "Modal", 3], "blocking": true}, {"nope": 1}]}',
      "```",
    ].join("\n");
    expect(parseNeedsInput(text)).toEqual({
      summary: "I found two login forms.",
      questions: [
        { text: "Which form?", options: ["Both", "Modal"], blocking: true },
      ],
    });
  });

  it("ignores broken blocks", () => {
    expect(
      parseNeedsInput('Done\n```json\n{"needs_input": [}\n```').questions,
    ).toEqual([]);
  });
});
