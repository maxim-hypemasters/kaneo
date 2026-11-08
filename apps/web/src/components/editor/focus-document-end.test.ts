import { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { ResizableImage } from "@/components/task/extensions/resizable-image";
import { createEditorExtensions } from "./extensions";
import { focusDocumentEnd } from "./focus-document-end";

let editor: Editor | undefined;

function createEditor(content: string, editable = true) {
  const element = document.createElement("div");
  document.body.append(element);
  editor = new Editor({
    element,
    editable,
    content,
    contentType: "markdown",
    extensions: createEditorExtensions({
      placeholder: "",
      highlighter: () => null,
      resolveLanguage: (value) => value,
      image: ResizableImage,
    }),
  });
  return editor;
}

// jsdom has no layout; focus("end") scrolls the caret into view.
beforeEach(() => {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(),
  });
});

afterEach(() => {
  editor?.destroy();
  editor = undefined;
  document.body.innerHTML = "";
});

describe("focusDocumentEnd", () => {
  it("puts the caret at the end of a trailing paragraph without changing the document", () => {
    const active = createEditor("# Title\n\nLast line");
    const before = active.getJSON();

    focusDocumentEnd(active);

    expect(active.getJSON()).toEqual(before);
    expect(active.state.selection.empty).toBe(true);
    expect(active.state.selection.from).toBe(active.state.doc.content.size - 1);
    // Focus moves at once, not on Tiptap's next animation frame, so typing
    // straight after the click lands in the document.
    expect(document.activeElement).toBe(active.view.dom);
  });

  it.each([
    ["table", "| A | B |\n| --- | --- |\n| 1 | 2 |"],
    ["code block", "```ts\nconst a = 1;\n```"],
    ["list", "- item"],
  ])("adds an empty paragraph after a trailing %s", (_name, markdown) => {
    const active = createEditor(markdown);
    const count = active.state.doc.childCount;

    focusDocumentEnd(active);

    const { doc, selection } = active.state;
    expect(doc.childCount).toBe(count + 1);
    expect(doc.lastChild?.type.name).toBe("paragraph");
    expect(doc.lastChild?.content.size).toBe(0);
    expect(selection.$from.parent).toBe(doc.lastChild);
  });

  it("does nothing in a read-only document", () => {
    const active = createEditor("| A |\n| --- |\n| 1 |", false);
    const before = active.getJSON();
    const selection = active.state.selection.from;

    focusDocumentEnd(active);

    expect(active.getJSON()).toEqual(before);
    expect(active.state.selection.from).toBe(selection);
    expect(document.activeElement).not.toBe(active.view.dom);
  });
});
