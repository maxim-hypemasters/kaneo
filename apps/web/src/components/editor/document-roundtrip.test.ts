import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { ResizableImage } from "@/components/task/extensions/resizable-image";
import { KaneoMention } from "@/components/task/extensions/kaneo-mention";
import { createEditorExtensions } from "./extensions";

let editor: Editor | undefined;

afterEach(() => editor?.destroy());

describe("document Markdown compatibility", () => {
  it("round trips headings, lists, tables, code, resized images, and attachments", () => {
    const markdown = [
      "# Feature",
      "",
      "## Requirements",
      "",
      "### Notes",
      "",
      "**Bold** and *italic*",
      "",
      "- [ ] Verify behavior",
      "",
      "1. First",
      "2. Second",
      "",
      "> Context",
      "",
      "| Name | Value |",
      "| --- | --- |",
      "| A | B |",
      "",
      "```typescript",
      "const enabled = true;",
      "```",
      "",
      '<img src="https://example.com/image.png" alt="Diagram" width="320" />',
      "",
      '<kaneo-attachment url="https://example.com/spec.pdf" filename="spec.pdf" mime-type="application/pdf" size="100"></kaneo-attachment>',
      "",
      '<kaneo-embed url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" mode="embed" />',
      "",
      '<kaneo-issue-link url="https://example.com/task/123" issue-key="KAN-12" task-id="123" />',
      "",
      'Assigned to <kaneo-mention id="user-1" label="Client dev"></kaneo-mention>',
    ].join("\n");
    const extensions = () =>
      createEditorExtensions({
        placeholder: "",
        highlighter: () => null,
        resolveLanguage: (value) => value,
        image: ResizableImage,
        extra: [KaneoMention],
      });
    editor = new Editor({
      extensions: extensions(),
      content: markdown,
      contentType: "markdown",
    });
    const saved = editor.getMarkdown();
    const before = editor.getJSON();
    editor.commands.setContent(saved, { contentType: "markdown" });
    // The existing embed serializer adds empty separating paragraphs.
    const contentBefore = before.content?.filter(
      (node) => node.type !== "paragraph" || node.content?.length,
    );
    const contentAfter = editor
      .getJSON()
      .content?.filter(
        (node) => node.type !== "paragraph" || node.content?.length,
      );
    expect(contentAfter).toEqual(contentBefore);
    expect(saved).toContain("# Feature");
    expect(saved).toContain("## Requirements");
    expect(saved).toContain("### Notes");
    expect(saved).toContain("**Bold**");
    expect(saved).toContain("320");
    expect(saved).toContain("spec.pdf");
    expect(saved).toContain("```typescript");
    const nodeTypes = new Set<string>();
    editor.state.doc.descendants((node) => {
      nodeTypes.add(node.type.name);
    });
    expect(nodeTypes.has("attachmentCard")).toBe(true);
    expect(nodeTypes.has("embedBlock")).toBe(true);
    expect(nodeTypes.has("kaneoIssueLink")).toBe(true);
    expect(nodeTypes.has("kaneoMention")).toBe(true);
    expect(saved).toContain(
      '<kaneo-mention id="user-1" label="Client dev"></kaneo-mention>',
    );
  });
});
