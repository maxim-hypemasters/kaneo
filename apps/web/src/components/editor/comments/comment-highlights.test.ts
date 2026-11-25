import type { Editor } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { captureAnchor } from "./capture-anchor";
import type { TrackedThread } from "./comment-highlight-state";
import {
  commentHighlightsKey,
  getCommentHighlightState,
  retryDetachedThreads,
  setActiveThread,
  setDraftRange,
  setTrackedThreads,
} from "./comment-highlights";
import { createCommentTestEditor, rangeOfText } from "./comment-test-editor";
import { projectDocumentText } from "./document-text";

const MARKDOWN = [
  "# Launch plan",
  "",
  "The team will review the budget before the launch date.",
  "",
  "Marketing owns the announcement and the press kit.",
].join("\n");

let editor: Editor;
const onThreadClick = vi.fn();
const onAdd = vi.fn();

afterEach(() => {
  editor.destroy();
  vi.clearAllMocks();
});

function open(options: { canAdd?: boolean; editable?: boolean } = {}) {
  editor = createCommentTestEditor(MARKDOWN, {
    comments: {
      onThreadClick,
      onAdd: options.canAdd === false ? undefined : onAdd,
    },
    editable: options.editable,
  });
}

function thread(id: string, quote: string, visible = true): TrackedThread {
  const range = rangeOfText(editor.state.doc, quote);
  const captured = captureAnchor(
    projectDocumentText(editor.state.doc),
    range.from,
    range.to,
  );
  if (!captured) throw new Error(`Nothing to anchor: ${quote}`);
  return { id, anchor: captured.anchor, visible };
}

function highlight(id: string) {
  return editor.view.dom.querySelector<HTMLElement>(
    `[data-comment-thread="${id}"]`,
  );
}

function click(pos: number, target: Element | null) {
  const plugin = commentHighlightsKey.get(editor.state);
  return plugin?.props.handleClick?.call(plugin, editor.view, pos, {
    target,
  } as unknown as MouseEvent);
}

function pressShortcut() {
  const event = new KeyboardEvent("keydown", {
    key: "m",
    code: "KeyM",
    ctrlKey: true,
    altKey: true,
    bubbles: true,
    cancelable: true,
  });
  editor.view.dom.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("CommentHighlights", () => {
  it("draws open threads, the active thread and the draft", () => {
    open();
    setTrackedThreads(editor, [
      thread("budget", "review the budget"),
      thread("kit", "press kit", false),
    ]);
    expect(highlight("budget")?.textContent).toBe("review the budget");
    expect(highlight("budget")?.className).toBe("kaneo-comment-highlight");
    expect(highlight("kit")).toBeNull();

    setActiveThread(editor, "budget");
    expect(highlight("budget")?.className).toBe(
      "kaneo-comment-highlight kaneo-comment-highlight-active",
    );

    setActiveThread(editor, "kit");
    expect(highlight("budget")?.className).toBe("kaneo-comment-highlight");
    expect(highlight("kit")?.textContent).toBe("press kit");
    expect(highlight("kit")?.className).toBe(
      "kaneo-comment-highlight kaneo-comment-highlight-active kaneo-comment-highlight-resolved",
    );

    setDraftRange(editor, rangeOfText(editor.state.doc, "launch date"));
    const draft = editor.view.dom.querySelector(
      ".kaneo-comment-highlight-draft",
    );
    expect(draft?.textContent).toBe("launch date");
    expect(draft?.hasAttribute("data-comment-thread")).toBe(false);
    setDraftRange(editor, null);
    expect(
      editor.view.dom.querySelector(".kaneo-comment-highlight-draft"),
    ).toBeNull();
  });

  it("highlights across blocks and keeps the highlight on edited text", () => {
    open();
    const from = rangeOfText(editor.state.doc, "launch date").from;
    const to = rangeOfText(editor.state.doc, "Marketing").to;
    const anchor = captureAnchor(
      projectDocumentText(editor.state.doc),
      from,
      to,
    );
    setTrackedThreads(editor, [
      { id: "wide", anchor: anchor!.anchor, visible: true },
    ]);
    const parts = editor.view.dom.querySelectorAll(
      '[data-comment-thread="wide"]',
    );
    expect(Array.from(parts, (part) => part.textContent)).toEqual([
      "launch date.",
      "Marketing",
    ]);

    editor.commands.insertContentAt(
      rangeOfText(editor.state.doc, "date").from,
      "and release ",
    );
    expect(highlight("wide")?.textContent).toBe("launch and release date.");
  });

  it("reports a click on a highlight and still lets the caret land", () => {
    open();
    setTrackedThreads(editor, [thread("budget", "review the budget")]);
    const { from } = rangeOfText(editor.state.doc, "the budget");
    expect(click(from, highlight("budget"))).toBe(false);
    expect(onThreadClick).toHaveBeenCalledExactlyOnceWith("budget");
  });

  it("ignores clicks that land next to a highlight", () => {
    open();
    setTrackedThreads(editor, [thread("budget", "review the budget")]);
    const { to } = rangeOfText(editor.state.doc, "review the budget");
    // The end of the highlight is also where a click on the next word lands.
    expect(click(to, editor.view.dom.querySelector("p"))).toBe(false);
    expect(click(to, null)).toBe(false);
    expect(
      click(
        rangeOfText(editor.state.doc, "Marketing").from,
        highlight("budget"),
      ),
    ).toBe(false);
    expect(onThreadClick).not.toHaveBeenCalled();
  });

  it("walks through stacked highlights on repeated clicks, innermost first", () => {
    open();
    setTrackedThreads(editor, [
      thread(
        "sentence",
        "The team will review the budget before the launch date.",
      ),
      thread("word", "budget"),
    ]);
    const pos = rangeOfText(editor.state.doc, "budget").from + 1;
    // Both threads decorate the same text, so the DOM names only one of them.
    const target = editor.view.dom.querySelector(".kaneo-comment-highlight");
    click(pos, target);
    expect(onThreadClick).toHaveBeenLastCalledWith("word");
    setActiveThread(editor, "word");
    click(pos, target);
    expect(onThreadClick).toHaveBeenLastCalledWith("sentence");
    setActiveThread(editor, "sentence");
    click(pos, target);
    expect(onThreadClick).toHaveBeenLastCalledWith("word");
  });

  it("starts a comment from the keyboard when text is selected", () => {
    open();
    editor.commands.setTextSelection(
      rangeOfText(editor.state.doc, "launch date"),
    );
    expect(pressShortcut()).toBe(true);
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onThreadClick).not.toHaveBeenCalled();
  });

  it("leaves the shortcut alone for people who cannot comment", () => {
    open({ canAdd: false });
    editor.commands.setTextSelection(
      rangeOfText(editor.state.doc, "launch date"),
    );
    expect(pressShortcut()).toBe(false);
  });

  it("opens the thread under the caret from the keyboard", () => {
    open();
    setTrackedThreads(editor, [thread("budget", "review the budget")]);
    editor.commands.setTextSelection(
      rangeOfText(editor.state.doc, "the budget").from,
    );
    expect(pressShortcut()).toBe(true);
    expect(onThreadClick).toHaveBeenCalledExactlyOnceWith("budget");
    expect(onAdd).not.toHaveBeenCalled();

    editor.commands.setTextSelection(
      rangeOfText(editor.state.doc, "Marketing").from,
    );
    expect(pressShortcut()).toBe(false);
    expect(onThreadClick).toHaveBeenCalledOnce();
  });

  it("shows highlights to readers and reports their clicks", () => {
    open({ editable: false });
    setTrackedThreads(editor, [thread("budget", "review the budget")]);
    setActiveThread(editor, "budget");
    expect(editor.view.dom.getAttribute("contenteditable")).toBe("false");
    expect(highlight("budget")?.className).toContain("-active");
    click(
      rangeOfText(editor.state.doc, "the budget").from,
      highlight("budget"),
    );
    expect(onThreadClick).toHaveBeenCalledExactlyOnceWith("budget");
  });

  it("never reports its own bookkeeping as a document change", () => {
    open();
    const onUpdate = vi.fn();
    editor.on("update", onUpdate);
    setTrackedThreads(editor, [thread("budget", "review the budget")]);
    setActiveThread(editor, "budget");
    setDraftRange(editor, rangeOfText(editor.state.doc, "launch date"));
    retryDetachedThreads(editor);
    expect(onUpdate).not.toHaveBeenCalled();
    editor.commands.insertContentAt(1, "Draft: ");
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it("reattaches detached threads on request", () => {
    open();
    setTrackedThreads(editor, [thread("budget", "review the budget")]);
    editor.commands.deleteRange(
      rangeOfText(editor.state.doc, "will review the budget before"),
    );
    expect(getCommentHighlightState(editor)?.ranges.size).toBe(0);
    editor.commands.undo();
    expect(highlight("budget")).toBeNull();
    retryDetachedThreads(editor);
    expect(highlight("budget")?.textContent).toBe("review the budget");
  });

  it("keeps its threads when the editor state is rebuilt for another document key", () => {
    open();
    setTrackedThreads(editor, [thread("budget", "review the budget")]);
    setActiveThread(editor, "budget");
    setDraftRange(editor, rangeOfText(editor.state.doc, "launch date"));
    const { schema, plugins, doc } = editor.state;
    editor.view.updateState(EditorState.create({ schema, plugins, doc }));
    expect(getCommentHighlightState(editor)).toMatchObject({
      activeId: "budget",
      draft: null,
    });
    expect(highlight("budget")?.className).toContain("-active");
  });

  it("does nothing in an editor without the extension", () => {
    editor = createCommentTestEditor(MARKDOWN);
    expect(getCommentHighlightState(editor)).toBeNull();
    const anchor = { quote: "review the budget", prefix: "", suffix: "" };
    setTrackedThreads(editor, [{ id: "budget", anchor, visible: true }]);
    setActiveThread(editor, "budget");
    setDraftRange(editor, { from: 1, to: 4 });
    retryDetachedThreads(editor);
    expect(
      editor.view.dom.querySelector(".kaneo-comment-highlight"),
    ).toBeNull();
  });
});
