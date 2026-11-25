import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { captureAnchor } from "./capture-anchor";
import { MAX_QUOTE_LENGTH } from "./comment-anchor";
import {
  createCommentTestEditor,
  rangeOfText,
  RICH_DOCUMENT,
} from "./comment-test-editor";
import { projectDocumentText } from "./document-text";

const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

let editor: Editor | undefined;

afterEach(() => editor?.destroy());

function open(content: Parameters<typeof createCommentTestEditor>[0]) {
  editor = createCommentTestEditor(content);
  const { doc } = editor.state;
  return { doc, projection: projectDocumentText(doc) };
}

const words = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

describe("captureAnchor", () => {
  it("quotes the selected text with the words around it", () => {
    const { doc, projection } = open(RICH_DOCUMENT);
    const range = rangeOfText(doc, "Collect feedback");
    expect(captureAnchor(projection, range.from, range.to)).toEqual({
      anchor: {
        quote: "Collect feedback",
        prefix: "t Share the draft with the team",
        suffix: "First step Second step Book the",
      },
      range,
      truncated: false,
    });
  });

  it("trims whitespace at both ends and narrows the range to match", () => {
    const { doc, projection } = open(
      "Intro\n\nsome  padded words here\n\nOutro",
    );
    const padded = rangeOfText(doc, " padded words ");
    const exact = rangeOfText(doc, "padded words");
    const captured = captureAnchor(projection, padded.from - 1, padded.to);
    expect(captured?.anchor.quote).toBe("padded words");
    expect(captured?.range).toEqual(exact);
    expect(captured?.anchor.prefix).toBe("Intro some");
    expect(captured?.anchor.suffix).toBe("here Outro");
  });

  it("has no context beyond the edges of the document", () => {
    const { doc, projection } = open("Only words here");
    const first = rangeOfText(doc, "Only");
    const last = rangeOfText(doc, "here");
    expect(captureAnchor(projection, first.from, first.to)?.anchor).toEqual({
      quote: "Only",
      prefix: "",
      suffix: "words here",
    });
    expect(captureAnchor(projection, last.from, last.to)?.anchor).toEqual({
      quote: "here",
      prefix: "Only words",
      suffix: "",
    });
    expect(captureAnchor(projection, 0, doc.content.size)?.anchor).toEqual({
      quote: "Only words here",
      prefix: "",
      suffix: "",
    });
  });

  it("reads a selection across blocks as one line", () => {
    const { doc, projection } = open(RICH_DOCUMENT);
    const from = rangeOfText(doc, "Second step").from;
    const to = rangeOfText(doc, "Book the room").to;
    expect(captureAnchor(projection, from, to)?.anchor.quote).toBe(
      "Second step Book the room",
    );
  });

  it("takes a mention or an issue link whole", () => {
    const { doc, projection } = open(RICH_DOCUMENT);
    const from = rangeOfText(doc, "Ask ").from;
    const to = rangeOfText(doc, "before").to;
    const captured = captureAnchor(projection, from, to);
    expect(captured?.anchor.quote).toBe(
      "Ask @Client dev to review KAN-12 before",
    );
    expect(captured?.range).toEqual({ from, to });
    const mention = rangeOfText(doc, "Ask ").to;
    expect(captureAnchor(projection, mention, mention + 1)).toMatchObject({
      anchor: { quote: "@Client dev", prefix: "Launch plan 🚀 overview Ask" },
      range: { from: mention, to: mention + 1 },
    });
  });

  it("returns nothing when the selection holds no text", () => {
    const { doc, projection } = open(RICH_DOCUMENT);
    let image = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === "image") image = pos;
    });
    expect(doc.nodeAt(image)?.type.name).toBe("image");
    expect(captureAnchor(projection, image, image + 1)).toBeNull();
    const caret = rangeOfText(doc, "Steps").from + 2;
    expect(captureAnchor(projection, caret, caret)).toBeNull();
    const gap = rangeOfText(doc, "Ask ");
    expect(captureAnchor(projection, gap.to - 1, gap.to)).toBeNull();
  });

  it("shortens a long quote to whole words and says so", () => {
    const text = Array.from({ length: 300 }, (_, index) => `word${index}`).join(
      " ",
    );
    const { doc, projection } = open(words(text));
    const captured = captureAnchor(projection, 0, doc.content.size);
    expect(captured?.truncated).toBe(true);
    const quote = captured?.anchor.quote ?? "";
    expect(quote.length).toBeLessThanOrEqual(MAX_QUOTE_LENGTH);
    expect(quote.length).toBeGreaterThan(MAX_QUOTE_LENGTH - 10);
    expect(text.startsWith(`${quote} word`)).toBe(true);
    expect(captured?.range).toEqual({ from: 1, to: 1 + quote.length });
    // The shortened range is itself a complete anchor.
    expect(
      captureAnchor(projection, captured!.range.from, captured!.range.to),
    ).toEqual({ ...captured, truncated: false });
  });

  it("cuts a single long word at the limit without splitting an emoji", () => {
    const plain = open(words("x".repeat(MAX_QUOTE_LENGTH + 50)));
    expect(
      captureAnchor(plain.projection, 0, plain.doc.content.size)?.anchor.quote,
    ).toHaveLength(MAX_QUOTE_LENGTH);
    editor?.destroy();

    const emoji = open(words(`${"x".repeat(MAX_QUOTE_LENGTH - 1)}😀tail`));
    const captured = captureAnchor(emoji.projection, 0, emoji.doc.content.size);
    expect(captured?.anchor.quote).toBe("x".repeat(MAX_QUOTE_LENGTH - 1));
    expect(captured?.anchor.suffix).toBe("😀tail");
  });

  it("never ends a shortened quote inside a mention", () => {
    const filler = Array.from({ length: 198 }, () => "word").join(" ");
    const { doc, projection } = open({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: `${filler} ` },
            { type: "kaneoMention", attrs: { id: "u", label: "Client dev" } },
            { type: "text", text: " and more words" },
          ],
        },
      ],
    });
    // The limit falls inside "dev", and the space inside the mention is not
    // a word boundary.
    expect(projection.text.slice(0, MAX_QUOTE_LENGTH + 1)).toBe(
      `${filler} @Client dev`,
    );
    const captured = captureAnchor(projection, 0, doc.content.size);
    expect(captured?.anchor.quote).toBe(filler);
    expect(captured?.range.to).toBe(1 + filler.length);
  });

  it("keeps surrogate pairs whole at every edge", () => {
    // 31 units of text put the start of the 32-unit context inside an emoji.
    const before = `😀${"a".repeat(31)}`;
    const after = `${"b".repeat(31)}😀`;
    const { doc, projection } = open(words(`${before}QUOTE${after}`));
    const quote = rangeOfText(doc, "QUOTE");
    const captured = captureAnchor(projection, quote.from, quote.to);
    expect(captured?.anchor).toEqual({
      quote: "QUOTE",
      prefix: "a".repeat(31),
      suffix: "b".repeat(31),
    });

    // A selection edge inside a pair takes the whole character.
    const split = captureAnchor(projection, 2, quote.to + after.length - 1);
    expect(split?.anchor.quote).toBe(`${before}QUOTE${after}`);
    expect(split?.range).toEqual({ from: 1, to: doc.content.size - 1 });
    for (const value of Object.values(split?.anchor ?? {}))
      expect(value).not.toMatch(LONE_SURROGATE);
  });
});
