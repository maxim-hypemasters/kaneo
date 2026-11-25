import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Mappable } from "@tiptap/pm/transform";
import type { CommentAnchor, CommentRange } from "./comment-anchor";
import {
  type DocumentTextProjection,
  projectDocumentText,
} from "./document-text";
import { resolveAnchor } from "./resolve-anchor";

// `visible` is false for a resolved thread: its place is still tracked so that
// reopening it puts the highlight back exactly where it was.
export type TrackedThread = {
  id: string;
  anchor: CommentAnchor;
  visible: boolean;
};

// `ranges` holds the threads that are attached to text right now and is the
// source of truth for where they are; a tracked id without a range is detached.
export type CommentHighlightState = {
  tracked: TrackedThread[];
  ranges: ReadonlyMap<string, CommentRange>;
  draft: CommentRange | null;
  activeId: string | null;
};

export type ShownThread = { thread: TrackedThread; range: CommentRange };

// Keeps the ranges that are already attached and looks up the rest in the
// document text, which is projected only if a thread needs it.
function attach(
  tracked: TrackedThread[],
  attached: ReadonlyMap<string, CommentRange>,
  doc: ProseMirrorNode,
) {
  let projection: DocumentTextProjection | undefined;
  const ranges = new Map<string, CommentRange>();
  for (const thread of tracked) {
    const range =
      attached.get(thread.id) ??
      resolveAnchor((projection ??= projectDocumentText(doc)), thread.anchor);
    if (range) ranges.set(thread.id, range);
  }
  return ranges;
}

// Text typed inside a range extends it; text typed at either edge does not.
function mapRange(range: CommentRange, mapping: Mappable) {
  const from = mapping.map(range.from, 1);
  const to = mapping.map(range.to, -1);
  return from < to ? { from, to } : null;
}

export function createHighlightState(
  doc: ProseMirrorNode,
  tracked: TrackedThread[],
  activeId: string | null = null,
): CommentHighlightState {
  return {
    tracked,
    ranges: attach(tracked, new Map(), doc),
    draft: null,
    activeId,
  };
}

// Follows a document change. A range that collapsed (its text was deleted, or
// the whole document was replaced) gets one chance to be found again in the
// new text before its thread becomes detached.
export function mapHighlightState(
  state: CommentHighlightState,
  mapping: Mappable,
  doc: ProseMirrorNode,
): CommentHighlightState {
  if (state.ranges.size === 0 && !state.draft) return state;
  const surviving = new Map<string, CommentRange>();
  for (const [id, range] of state.ranges) {
    const mapped = mapRange(range, mapping);
    if (mapped) surviving.set(id, mapped);
  }
  const collapsed = state.tracked.filter(
    (thread) => state.ranges.has(thread.id) && !surviving.has(thread.id),
  );
  const found = attach(collapsed, new Map(), doc);
  return {
    ...state,
    ranges: new Map([...surviving, ...found]),
    draft: state.draft && mapRange(state.draft, mapping),
  };
}

// A new list of threads never moves a range that is attached: after unsaved
// local edits the server's quote is older than the text on screen, and
// resolving it again would wrongly detach the thread.
export function withTrackedThreads(
  state: CommentHighlightState,
  doc: ProseMirrorNode,
  tracked: TrackedThread[],
): CommentHighlightState {
  return { ...state, tracked, ranges: attach(tracked, state.ranges, doc) };
}

export function retryDetached(
  state: CommentHighlightState,
  doc: ProseMirrorNode,
): CommentHighlightState {
  if (state.ranges.size === state.tracked.length) return state;
  const ranges = attach(state.tracked, state.ranges, doc);
  return ranges.size === state.ranges.size ? state : { ...state, ranges };
}

export function withActiveThread(
  state: CommentHighlightState,
  activeId: string | null,
): CommentHighlightState {
  return state.activeId === activeId ? state : { ...state, activeId };
}

export function withDraftRange(
  state: CommentHighlightState,
  draft: CommentRange | null,
): CommentHighlightState {
  return { ...state, draft };
}

// The threads that have a highlight: open ones, plus the active one even when
// it is resolved.
export function shownThreads(state: CommentHighlightState): ShownThread[] {
  const shown: ShownThread[] = [];
  for (const thread of state.tracked) {
    const range = state.ranges.get(thread.id);
    if (range && (thread.visible || thread.id === state.activeId))
      shown.push({ thread, range });
  }
  return shown;
}

// Ids of the highlights at `pos`, innermost first.
export function threadAt(state: CommentHighlightState, pos: number): string[] {
  return shownThreads(state)
    .filter(({ range }) => range.from <= pos && pos <= range.to)
    .sort((a, b) => a.range.to - a.range.from - (b.range.to - b.range.from))
    .map(({ thread }) => thread.id);
}
