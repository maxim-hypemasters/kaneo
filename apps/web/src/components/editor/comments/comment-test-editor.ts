import { type Content, Editor, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { KaneoMention } from "@/components/task/extensions/kaneo-mention";
import { ResizableImage } from "@/components/task/extensions/resizable-image";
import { createEditorExtensions } from "../extensions";
import type { CommentRange } from "./comment-anchor";
import {
  CommentHighlights,
  type CommentHighlightsOptions,
} from "./comment-highlights";

// Test support for this folder: a headless editor with the document schema.
// A string is read as Markdown.
export function createCommentTestEditor(
  content: Content,
  options: {
    comments?: Partial<CommentHighlightsOptions>;
    editable?: boolean;
  } = {},
) {
  return new Editor({
    extensions: createEditorExtensions({
      placeholder: "",
      highlighter: () => null,
      resolveLanguage: (value) => value,
      image: ResizableImage,
      extra: options.comments
        ? [KaneoMention, CommentHighlights.configure(options.comments)]
        : [KaneoMention],
    }),
    content,
    contentType: typeof content === "string" ? "markdown" : undefined,
    editable: options.editable ?? true,
  });
}

// The range of the nth occurrence of `needle`, which must sit inside one text
// node.
export function rangeOfText(
  doc: ProseMirrorNode,
  needle: string,
  nth = 0,
): CommentRange {
  let seen = 0;
  let found: CommentRange | undefined;
  doc.descendants((node, pos) => {
    if (found || !node.isText || !node.text) return;
    for (
      let index = node.text.indexOf(needle);
      index !== -1;
      index = node.text.indexOf(needle, index + 1)
    ) {
      if (seen === nth) {
        found = { from: pos + index, to: pos + index + needle.length };
        return;
      }
      seen += 1;
    }
  });
  if (!found) throw new Error(`Text not found: ${needle}`);
  return found;
}

const text = (value: string, mark?: string): JSONContent => ({
  type: "text",
  text: value,
  ...(mark ? { marks: [{ type: mark }] } : {}),
});
const paragraph = (...content: JSONContent[]): JSONContent => ({
  type: "paragraph",
  content,
});
const item = (
  type: string,
  value: string,
  ...more: JSONContent[]
): JSONContent => ({
  type,
  content: [paragraph(text(value)), ...more],
});

// One of everything a document can hold, written so that saving it as
// Markdown and loading it again changes nothing but whitespace.
export const RICH_DOCUMENT: JSONContent = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [text("Launch plan 🚀 overview")],
    },
    paragraph(
      text("Ask "),
      { type: "kaneoMention", attrs: { id: "user-1", label: "Client dev" } },
      text(" to review "),
      {
        type: "kaneoIssueLink",
        attrs: { url: "https://kaneo.example.com/issue/KAN-12" },
      },
      text("before Friday."),
      { type: "hardBreak" },
      text("Second line with "),
      text("bold", "bold"),
      text(" and "),
      text("inline code", "code"),
      text("."),
    ),
    { type: "heading", attrs: { level: 2 }, content: [text("Steps")] },
    {
      type: "bulletList",
      content: [
        item("listItem", "Write the draft", {
          type: "bulletList",
          content: [item("listItem", "Share the draft with the team")],
        }),
        item("listItem", "Collect feedback"),
      ],
    },
    {
      type: "orderedList",
      content: [
        item("listItem", "First step"),
        item("listItem", "Second step"),
      ],
    },
    {
      type: "taskList",
      content: [
        { ...item("taskItem", "Book the room"), attrs: { checked: true } },
        { ...item("taskItem", "Send invites"), attrs: { checked: false } },
      ],
    },
    {
      type: "blockquote",
      content: [paragraph(text("Ship small, ship often."))],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            item("tableHeader", "Owner"),
            item("tableHeader", "Status"),
          ],
        },
        {
          type: "tableRow",
          content: [
            item("tableCell", "Dana"),
            item("tableCell", "In progress"),
          ],
        },
      ],
    },
    {
      type: "codeBlock",
      attrs: { language: "typescript" },
      content: [text("const ready = true;\n  return ready;")],
    },
    {
      type: "image",
      attrs: { src: "https://example.com/diagram.png", alt: "Diagram" },
    },
    paragraph(text("The draft is ready and the draft is short.")),
    {
      type: "embedBlock",
      attrs: {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        mode: "embed",
      },
    },
    paragraph(text("Closing words 👨‍👩‍👧 for the team.")),
  ],
};

export const RICH_DOCUMENT_TEXT =
  "Launch plan 🚀 overview Ask @Client dev to review KAN-12 before Friday. " +
  "Second line with bold and inline code. Steps Write the draft " +
  "Share the draft with the team Collect feedback First step Second step " +
  "Book the room Send invites Ship small, ship often. Owner Status Dana " +
  "In progress const ready = true; return ready; " +
  "The draft is ready and the draft is short. Closing words 👨‍👩‍👧 for the team.";
