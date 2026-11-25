import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { captureAnchor } from "./capture-anchor";
import type { TrackedThread } from "./comment-highlight-state";
import {
  getCommentHighlightState,
  setTrackedThreads,
} from "./comment-highlights";
import { createCommentTestEditor, rangeOfText } from "./comment-test-editor";
import { projectDocumentText } from "./document-text";
import { pendingAnchorUpdates } from "./pending-anchor-updates";

let editor: Editor;

afterEach(() => editor.destroy());

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

function pending() {
  const state = getCommentHighlightState(editor);
  if (!state) throw new Error("Missing comment highlights");
  return pendingAnchorUpdates(
    projectDocumentText(editor.state.doc),
    state.tracked,
    state.ranges,
  );
}

describe("pendingAnchorUpdates", () => {
  it("reports the anchors that edits have made stale, and only those", () => {
    editor = createCommentTestEditor(
      [
        "The team will review the budget before the launch date.",
        "",
        "Marketing owns the announcement and the press kit.",
        "",
        "Legal signs off on the final contract in March.",
      ].join("\n"),
      { comments: {} },
    );
    setTrackedThreads(editor, [
      thread("budget", "review the budget"),
      thread("kit", "press kit", false),
      thread("contract", "final contract"),
      thread("march", "March"),
      {
        id: "detached",
        anchor: { quote: "a deleted sentence", prefix: "", suffix: "" },
        visible: true,
      },
    ]);
    expect(pending()).toEqual([]);

    // Inside one highlight, right before another, and over a third.
    editor.commands.insertContentAt(
      rangeOfText(editor.state.doc, "the budget").from,
      "and approve ",
    );
    editor.commands.insertContentAt(
      rangeOfText(editor.state.doc, "press kit").from,
      "resolved ",
    );
    editor.commands.deleteRange(
      rangeOfText(editor.state.doc, "the final contract in"),
    );

    // "contract" lost its text and is detached, so it keeps its old anchor.
    expect(getCommentHighlightState(editor)?.ranges.has("contract")).toBe(
      false,
    );
    expect(pending()).toEqual([
      {
        id: "budget",
        quote: "review and approve the budget",
        prefix: "The team will",
        suffix: "before the launch date. Marketi",
      },
      {
        id: "kit",
        quote: "press kit",
        prefix: "e announcement and the resolved",
        suffix: ". Legal signs off on March.",
      },
      {
        id: "march",
        quote: "March",
        prefix: "d press kit. Legal signs off on",
        suffix: ".",
      },
    ]);
  });
});
