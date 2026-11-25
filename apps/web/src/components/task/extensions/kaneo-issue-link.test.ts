import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createEditorExtensions } from "@/components/editor/extensions";
import { ResizableImage } from "./resizable-image";

let editor: Editor | undefined;

afterEach(() => editor?.destroy());

const attrs = {
  url: "https://kaneo.example.com/issue/KAN-12",
  issueKey: "KAN-12",
  taskId: "task123",
};
const tag =
  '<kaneo-issue-link url="https://kaneo.example.com/issue/KAN-12" issue-key="KAN-12" task-id="task123" />';

function create(content: string, contentType?: "markdown") {
  editor?.destroy();
  editor = new Editor({
    extensions: createEditorExtensions({
      placeholder: "",
      highlighter: () => null,
      resolveLanguage: (value) => value,
      image: ResizableImage,
    }),
    content,
    ...(contentType ? { contentType } : {}),
  });
  return editor;
}

function issueLinks(active: Editor) {
  const found: Record<string, unknown>[] = [];
  active.state.doc.descendants((node) => {
    if (node.type.name === "kaneoIssueLink") found.push(node.attrs);
  });
  return found;
}

describe("KaneoIssueLink", () => {
  it("reads its key and task from saved Markdown", () => {
    expect(issueLinks(create(`See ${tag}`, "markdown"))).toEqual([attrs]);
  });

  it("keeps its key and task through a save and reload", () => {
    const active = create("", "markdown");
    active.commands.insertContent({ type: "kaneoIssueLink", attrs });
    const saved = active.getMarkdown();
    expect(saved).toContain(tag);
    active.commands.setContent(saved, { contentType: "markdown" });
    expect(issueLinks(active)).toEqual([attrs]);
    expect(active.getMarkdown()).toContain(tag);
  });

  it("reads the HTML it renders", () => {
    const active = create("", "markdown");
    active.commands.insertContent({ type: "kaneoIssueLink", attrs });
    const html = active.getHTML();
    active.commands.setContent(html);
    expect(issueLinks(active)).toEqual([attrs]);
  });

  it("reads the span form, which names everything with data attributes", () => {
    expect(
      issueLinks(
        create(
          '<p><span data-type="kaneo-issue-link" data-url="https://kaneo.example.com/issue/KAN-12" data-issue-key="KAN-12" data-task-id="task123"></span></p>',
        ),
      ),
    ).toEqual([attrs]);
  });

  it("restores a key and task that an earlier save left empty", () => {
    expect(
      issueLinks(
        create(
          '<kaneo-issue-link url="https://kaneo.example.com/issue/kan-12" issue-key="" task-id="" />',
          "markdown",
        ),
      ),
    ).toEqual([
      {
        url: "https://kaneo.example.com/issue/kan-12",
        issueKey: "KAN-12",
        taskId: "",
      },
    ]);
    expect(
      issueLinks(
        create(
          '<kaneo-issue-link url="https://kaneo.example.com/dashboard/workspace/w/project/p/task/task123" issue-key="" task-id="" />',
          "markdown",
        ),
      ),
    ).toMatchObject([{ issueKey: "", taskId: "task123" }]);
  });

  it("leaves the key and task empty when neither the tag nor the URL has them", () => {
    expect(
      issueLinks(
        create(
          '<kaneo-issue-link url="https://kaneo.example.com/x" issue-key="" task-id="" />',
          "markdown",
        ),
      ),
    ).toEqual([
      { url: "https://kaneo.example.com/x", issueKey: "", taskId: "" },
    ]);
  });
});
