import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { captureAnchor } from "./capture-anchor";
import {
  type CommentHighlightState,
  createHighlightState,
  mapHighlightState,
  retryDetached,
  shownThreads,
  threadAt,
  type TrackedThread,
  withActiveThread,
  withDraftRange,
  withTrackedThreads,
} from "./comment-highlight-state";
import { createCommentTestEditor, rangeOfText } from "./comment-test-editor";
import { projectDocumentText } from "./document-text";

const MARKDOWN = [
  "# Launch plan",
  "",
  "The team will review the budget before the launch date.",
  "",
  "Marketing owns the announcement and the press kit.",
].join("\n");

let editor: Editor | undefined;
let state: CommentHighlightState;

afterEach(() => editor?.destroy());

function doc() {
  return editor!.state.doc;
}

function thread(id: string, quote: string, visible = true): TrackedThread {
  const range = rangeOfText(doc(), quote);
  const captured = captureAnchor(
    projectDocumentText(doc()),
    range.from,
    range.to,
  );
  if (!captured) throw new Error(`Nothing to anchor: ${quote}`);
  return { id, anchor: captured.anchor, visible };
}

// Opens the document and keeps `state` in step with every edit, the way the
// plugin does.
function open(threads: () => TrackedThread[]) {
  editor = createCommentTestEditor(MARKDOWN);
  state = createHighlightState(doc(), threads());
  editor.on("transaction", ({ transaction }) => {
    if (transaction.docChanged)
      state = mapHighlightState(state, transaction.mapping, transaction.doc);
  });
}

function textOf(id: string) {
  const range = state.ranges.get(id);
  return range ? doc().textBetween(range.from, range.to, " ") : null;
}

describe("comment highlight state", () => {
  it("attaches the threads it can find and leaves the rest detached", () => {
    open(() => [
      thread("budget", "review the budget"),
      thread("kit", "press kit", false),
      {
        id: "gone",
        anchor: {
          quote: "a sentence that was deleted",
          prefix: "",
          suffix: "",
        },
        visible: true,
      },
    ]);
    expect(textOf("budget")).toBe("review the budget");
    expect(textOf("kit")).toBe("press kit");
    expect(state.ranges.has("gone")).toBe(false);
    expect(state.tracked.map(({ id }) => id)).toEqual([
      "budget",
      "kit",
      "gone",
    ]);
    expect(state).toMatchObject({ draft: null, activeId: null });
  });

  it("extends a highlight when text is typed inside it", () => {
    open(() => [thread("budget", "review the budget")]);
    editor!.commands.insertContentAt(
      rangeOfText(doc(), "the budget").from,
      "all of ",
    );
    expect(textOf("budget")).toBe("review all of the budget");
  });

  it("does not extend a highlight when text is typed at its edges", () => {
    open(() => [thread("budget", "review the budget")]);
    const { from } = rangeOfText(doc(), "review the budget");
    editor!.commands.insertContentAt(from, "quickly ");
    expect(textOf("budget")).toBe("review the budget");
    editor!.commands.insertContentAt(
      rangeOfText(doc(), "review the budget").to,
      " twice",
    );
    expect(textOf("budget")).toBe("review the budget");
    expect(doc().textContent).toContain("quickly review the budget twice");
  });

  it("shrinks with a partial deletion and detaches when the text is gone", () => {
    open(() => [
      thread("budget", "review the budget"),
      thread("kit", "press kit"),
    ]);
    editor!.commands.deleteRange(rangeOfText(doc(), " the budget before"));
    expect(textOf("budget")).toBe("review");
    editor!.commands.deleteRange(rangeOfText(doc(), "will review the"));
    expect(state.ranges.has("budget")).toBe(false);
    expect(state.tracked).toHaveLength(2);
    expect(textOf("kit")).toBe("press kit");
  });

  it("reattaches after an undo once asked to retry", () => {
    open(() => [thread("budget", "review the budget")]);
    const original = state.ranges.get("budget");
    editor!.commands.deleteRange(
      rangeOfText(doc(), "will review the budget before"),
    );
    expect(state.ranges.has("budget")).toBe(false);
    editor!.commands.undo();
    expect(doc().textContent).toContain("review the budget");
    // Mapping alone cannot bring a dropped range back.
    expect(state.ranges.has("budget")).toBe(false);
    state = retryDetached(state, doc());
    expect(state.ranges.get("budget")).toEqual(original);
    expect(retryDetached(state, doc())).toBe(state);
  });

  it("finds a highlight again in the same change that moved its text", () => {
    open(() => [thread("kit", "press kit")]);
    const before = state.ranges.get("kit");
    const { from, to } = rangeOfText(
      doc(),
      "the announcement and the press kit",
    );
    editor!
      .chain()
      .command(({ tr }) => {
        tr.delete(from, to).insertText(
          "the press kit and the announcement",
          from,
        );
        return true;
      })
      .run();
    expect(textOf("kit")).toBe("press kit");
    expect(state.ranges.get("kit")).not.toEqual(before);
  });

  it("resolves every thread again when the whole document is replaced", () => {
    open(() => [
      thread("budget", "review the budget"),
      thread("kit", "press kit"),
    ]);
    const before = state.ranges.get("budget");
    editor!.commands.setContent(
      `A new opening paragraph.\n\n${MARKDOWN.replace("press kit", "media pack")}`,
      { contentType: "markdown" },
    );
    expect(textOf("budget")).toBe("review the budget");
    expect(state.ranges.get("budget")?.from).toBeGreaterThan(before!.from);
    expect(state.ranges.has("kit")).toBe(false);
    expect(state.tracked).toHaveLength(2);
  });

  it("keeps a live range when the thread list is refreshed during unsaved edits", () => {
    open(() => [
      thread("budget", "review the budget"),
      thread("kit", "press kit"),
      {
        id: "late",
        anchor: { quote: "press release", prefix: "", suffix: "" },
        visible: true,
      },
    ]);
    const stale = state.tracked;
    editor!.commands.insertContentAt(
      rangeOfText(doc(), "the budget").from,
      "and approve ",
    );
    const live = state.ranges.get("budget");
    expect(textOf("budget")).toBe("review and approve the budget");
    editor!.commands.insertContentAt(
      rangeOfText(doc(), "press kit").to,
      " and the press release",
    );

    // The server still has the old quote for "budget"; "kit" was deleted
    // there, "date" is new, and "late" can now be found.
    const refreshed = [
      { ...stale[0], visible: false },
      stale[2],
      thread("date", "launch date"),
    ];
    state = withTrackedThreads(state, doc(), refreshed);
    expect(state.ranges.get("budget")).toEqual(live);
    expect(state.tracked).toBe(refreshed);
    expect(state.ranges.has("kit")).toBe(false);
    expect(textOf("date")).toBe("launch date");
    expect(textOf("late")).toBe("press release");
  });

  it("tracks resolved threads but shows them only while active", () => {
    open(() => [
      thread("budget", "review the budget"),
      thread("kit", "press kit", false),
    ]);
    const kit = state.ranges.get("kit")!;
    expect(shownThreads(state).map(({ thread }) => thread.id)).toEqual([
      "budget",
    ]);
    expect(threadAt(state, kit.from + 1)).toEqual([]);

    state = withActiveThread(state, "kit");
    expect(shownThreads(state).map(({ thread }) => thread.id)).toEqual([
      "budget",
      "kit",
    ]);
    expect(threadAt(state, kit.from + 1)).toEqual(["kit"]);
    expect(withActiveThread(state, "kit")).toBe(state);

    // Reopening puts the highlight back where it was tracked all along.
    editor!.commands.insertContentAt(1, "Draft: ");
    state = withTrackedThreads(
      withActiveThread(state, null),
      doc(),
      state.tracked.map((item) => ({ ...item, visible: true })),
    );
    expect(textOf("kit")).toBe("press kit");
    expect(threadAt(state, state.ranges.get("kit")!.from)).toEqual(["kit"]);
  });

  it("lists stacked highlights innermost first, edges included", () => {
    open(() => [
      thread(
        "sentence",
        "The team will review the budget before the launch date.",
      ),
      thread("budget", "review the budget"),
      thread("word", "budget"),
    ]);
    const word = state.ranges.get("word")!;
    const budget = state.ranges.get("budget")!;
    expect(threadAt(state, word.from + 2)).toEqual([
      "word",
      "budget",
      "sentence",
    ]);
    expect(threadAt(state, word.to)).toEqual(["word", "budget", "sentence"]);
    expect(threadAt(state, budget.from)).toEqual(["budget", "sentence"]);
    expect(threadAt(state, budget.to + 1)).toEqual(["sentence"]);
    expect(threadAt(state, rangeOfText(doc(), "Marketing").from)).toEqual([]);
  });

  it("maps the draft like a highlight and drops it when its text is deleted", () => {
    open(() => []);
    expect(mapHighlightState(state, editor!.state.tr.mapping, doc())).toBe(
      state,
    );
    state = withDraftRange(state, rangeOfText(doc(), "launch date"));
    editor!.commands.insertContentAt(1, "Draft: ");
    expect(state.draft).toEqual(rangeOfText(doc(), "launch date"));
    editor!.commands.insertContentAt(
      rangeOfText(doc(), " date").from,
      " and review",
    );
    expect(doc().textBetween(state.draft!.from, state.draft!.to)).toBe(
      "launch and review date",
    );
    editor!.commands.deleteRange(
      rangeOfText(doc(), "the launch and review date."),
    );
    expect(state.draft).toBeNull();
  });
});
