import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  createCommentTestEditor,
  RICH_DOCUMENT,
  RICH_DOCUMENT_TEXT,
} from "./comment-test-editor";
import { projectDocumentText } from "./document-text";

let editor: Editor | undefined;

afterEach(() => editor?.destroy());

function project(content: Parameters<typeof createCommentTestEditor>[0]) {
  editor = createCommentTestEditor(content);
  return { doc: editor.state.doc, ...projectDocumentText(editor.state.doc) };
}

describe("projectDocumentText", () => {
  it("reads headings, lists, tables, code, mentions, issue links, breaks, images and emoji as one line", () => {
    expect(project(RICH_DOCUMENT).text).toBe(RICH_DOCUMENT_TEXT);
  });

  it("maps every character back to where it came from", () => {
    const { doc, text, starts, ends } = project(RICH_DOCUMENT);
    expect(starts).toHaveLength(text.length);
    expect(ends).toHaveLength(text.length);
    for (let index = 0; index < text.length; index += 1) {
      if (index > 0) {
        expect(starts[index]).toBeGreaterThanOrEqual(starts[index - 1]);
        expect(ends[index]).toBeGreaterThanOrEqual(ends[index - 1]);
      }
      if (text[index] === " ") continue;
      expect(ends[index]).toBe(starts[index] + 1);
      const node = doc.nodeAt(starts[index]);
      if (node?.isText)
        expect(doc.textBetween(starts[index], ends[index])).toBe(text[index]);
      else expect(node?.isAtom).toBe(true);
    }
  });

  it("maps all of a mention to its one position, spaces included", () => {
    const { doc, text, starts, ends } = project(RICH_DOCUMENT);
    const at = text.indexOf("@Client dev");
    const position = starts[at];
    expect(doc.nodeAt(position)?.type.name).toBe("kaneoMention");
    for (let index = at; index < at + "@Client dev".length; index += 1)
      expect([starts[index], ends[index]]).toEqual([position, position + 1]);
  });

  it("gives a space the gap between its neighbours", () => {
    const { text, starts, ends } = project("One\n\nTwo  three");
    expect(text).toBe("One Two three");
    // Between two blocks: the closing and opening tokens.
    expect([starts[3], ends[3]]).toEqual([ends[2], starts[4]]);
    expect(ends[3] - starts[3]).toBe(2);
  });

  it("collapses whitespace runs and has none at the edges", () => {
    const { text } = project({
      type: "doc",
      content: [
        { type: "image", attrs: { src: "https://example.com/a.png" } },
        { type: "paragraph" },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "  padded  \ttext " },
            { type: "hardBreak" },
            { type: "hardBreak" },
            { type: "text", text: " end  " },
          ],
        },
        { type: "paragraph" },
        { type: "horizontalRule" },
      ],
    });
    expect(text).toBe("padded text end");
  });

  it("projects an empty document as nothing", () => {
    expect(
      project({ type: "doc", content: [{ type: "paragraph" }] }),
    ).toMatchObject({ text: "", starts: [], ends: [] });
  });

  it("keeps cards and issue links apart from the words around them", () => {
    const link = (url: string, issueKey = "") => ({
      type: "kaneoIssueLink",
      attrs: { url, issueKey },
    });
    const { text } = project({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "see" },
            link("https://kaneo.example.com/issue/kan-7"),
            { type: "text", text: "and" },
            // Without a key in the URL the chip has no stable text of its own.
            link("https://kaneo.example.com/task/abc123", "KAN-9"),
            { type: "text", text: "or" },
            {
              type: "attachmentCard",
              attrs: { url: "https://example.com/a.pdf", filename: "a.pdf" },
            },
            { type: "text", text: "done" },
          ],
        },
      ],
    });
    expect(text).toBe("see KAN-7 and or done");
  });

  it("reads the same text after the document is saved as Markdown and loaded again", () => {
    const before = project(RICH_DOCUMENT).text;
    const markdown = editor!.getMarkdown();
    editor!.commands.setContent(markdown, { contentType: "markdown" });
    expect(projectDocumentText(editor!.state.doc).text).toBe(before);
    // The issue link has moved onto a line of its own by now.
    expect(markdown).toContain("\n<kaneo-issue-link");
  });
});
