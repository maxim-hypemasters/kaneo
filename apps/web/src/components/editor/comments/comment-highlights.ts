import { type Editor, Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { CommentRange } from "./comment-anchor";
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

export type CommentHighlightsOptions = {
  onThreadClick: (threadId: string) => void;
  onAdd?: () => void;
};

type CommentHighlightsStorage = {
  tracked: TrackedThread[];
  activeId: string | null;
};

type CommentHighlightsMeta =
  | { type: "threads"; threads: TrackedThread[] }
  | { type: "active"; id: string | null }
  | { type: "draft"; range: CommentRange | null }
  | { type: "retry" };

declare module "@tiptap/core" {
  interface Storage {
    commentHighlights: CommentHighlightsStorage;
  }
}

const HIGHLIGHT_CLASS = "kaneo-comment-highlight";

export const commentHighlightsKey = new PluginKey<CommentHighlightState>(
  "commentHighlights",
);

function buildDecorations(doc: ProseMirrorNode, state: CommentHighlightState) {
  const decorations = shownThreads(state).map(({ thread, range }) =>
    Decoration.inline(range.from, range.to, {
      class: [
        HIGHLIGHT_CLASS,
        thread.id === state.activeId && `${HIGHLIGHT_CLASS}-active`,
        !thread.visible && `${HIGHLIGHT_CLASS}-resolved`,
      ]
        .filter(Boolean)
        .join(" "),
      "data-comment-thread": thread.id,
    }),
  );
  if (state.draft)
    decorations.push(
      Decoration.inline(state.draft.from, state.draft.to, {
        class: `${HIGHLIGHT_CLASS} ${HIGHLIGHT_CLASS}-draft`,
      }),
    );
  return DecorationSet.create(doc, decorations);
}

// Repeating the gesture on stacked highlights walks through them, starting
// with the innermost.
function nextThreadAt(state: CommentHighlightState, pos: number) {
  const ids = threadAt(state, pos);
  const active = state.activeId === null ? -1 : ids.indexOf(state.activeId);
  return ids.at((active + 1) % ids.length);
}

export const CommentHighlights = Extension.create<
  CommentHighlightsOptions,
  CommentHighlightsStorage
>({
  name: "commentHighlights",

  addOptions() {
    return { onThreadClick: () => {}, onAdd: undefined };
  },

  addStorage() {
    return { tracked: [], activeId: null };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-m": () => {
        const { state } = this.editor;
        if (!state.selection.empty) {
          if (!this.options.onAdd) return false;
          this.options.onAdd();
          return true;
        }
        const highlights = commentHighlightsKey.getState(state);
        const id = highlights && nextThreadAt(highlights, state.selection.from);
        if (!id) return false;
        this.options.onThreadClick(id);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const { options, storage } = this;
    let drawn:
      | { state: CommentHighlightState; doc: ProseMirrorNode }
      | undefined;
    let decorations = DecorationSet.empty;

    return [
      new Plugin<CommentHighlightState>({
        key: commentHighlightsKey,
        state: {
          // The document editor builds a fresh EditorState when it switches
          // documents, which runs this again; the threads live in storage so
          // that the highlights are not lost with the old state.
          init: (_config, state) =>
            createHighlightState(state.doc, storage.tracked, storage.activeId),
          apply: (transaction, value) => {
            const state = transaction.docChanged
              ? mapHighlightState(value, transaction.mapping, transaction.doc)
              : value;
            const meta = transaction.getMeta(commentHighlightsKey) as
              | CommentHighlightsMeta
              | undefined;
            if (!meta) return state;
            if (meta.type === "threads")
              return withTrackedThreads(state, transaction.doc, meta.threads);
            if (meta.type === "retry")
              return retryDetached(state, transaction.doc);
            if (meta.type === "active") return withActiveThread(state, meta.id);
            return withDraftRange(state, meta.range);
          },
        },
        props: {
          decorations: (editorState) => {
            const state = commentHighlightsKey.getState(editorState);
            if (!state) return DecorationSet.empty;
            if (drawn?.state !== state || drawn.doc !== editorState.doc) {
              drawn = { state, doc: editorState.doc };
              decorations = buildDecorations(editorState.doc, state);
            }
            return decorations;
          },
          // Stacked highlights share one DOM element whose attributes are
          // merged, so the element only tells that a highlight was hit; which
          // thread it belongs to comes from the tracked ranges.
          handleClick: (view, pos, event) => {
            const state = commentHighlightsKey.getState(view.state);
            if (
              state &&
              event.target instanceof Element &&
              event.target.closest(`.${HIGHLIGHT_CLASS}`)
            ) {
              const id = nextThreadAt(state, pos);
              if (id) options.onThreadClick(id);
            }
            return false;
          },
        },
      }),
    ];
  },
});

export function getCommentHighlightState(
  editor: Editor,
): CommentHighlightState | null {
  return commentHighlightsKey.getState(editor.state) ?? null;
}

function dispatch(editor: Editor, meta: CommentHighlightsMeta) {
  if (!getCommentHighlightState(editor)) return;
  editor.view.dispatch(editor.state.tr.setMeta(commentHighlightsKey, meta));
}

function remember(editor: Editor, values: Partial<CommentHighlightsStorage>) {
  const storage = editor.storage.commentHighlights as
    | CommentHighlightsStorage
    | undefined;
  if (storage) Object.assign(storage, values);
}

export function setTrackedThreads(editor: Editor, threads: TrackedThread[]) {
  remember(editor, { tracked: threads });
  dispatch(editor, { type: "threads", threads });
}

export function setActiveThread(editor: Editor, id: string | null) {
  remember(editor, { activeId: id });
  dispatch(editor, { type: "active", id });
}

export function setDraftRange(editor: Editor, range: CommentRange | null) {
  dispatch(editor, { type: "draft", range });
}

// For text that came back after its thread was detached, such as an undone
// deletion or a block pasted elsewhere.
export function retryDetachedThreads(editor: Editor) {
  dispatch(editor, { type: "retry" });
}
