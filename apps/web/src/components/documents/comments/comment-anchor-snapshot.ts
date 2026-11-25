import type { CommentAnchorUpdate } from "@/components/editor/comments/comment-anchor";

// The anchors edits have moved, together with the exact body they describe.
export type CommentAnchorSnapshot = {
  body: string;
  updates: CommentAnchorUpdate[];
};

// Anchors travel only with the text they were taken from. A save can start
// after more typing, wait offline, or flush once the editor is gone; sending
// anchors with any other body would attach threads to the wrong text.
export function anchorUpdatesFor(
  input: { body?: string },
  snapshot: CommentAnchorSnapshot | null | undefined,
): CommentAnchorUpdate[] {
  return snapshot && input.body !== undefined && input.body === snapshot.body
    ? snapshot.updates
    : [];
}
