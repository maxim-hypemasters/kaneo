import type { CommentAnchorUpdate } from "@/components/editor/comments/comment-anchor";
import type { DocumentCommentThread } from "@/fetchers/document-comment/types";

// Every change to a thread answers with the whole thread, so the list is
// patched in place: this window never hears its own change over the socket.
export function withThread(
  threads: DocumentCommentThread[],
  thread: DocumentCommentThread,
) {
  return threads.some((existing) => existing.id === thread.id)
    ? threads.map((existing) => (existing.id === thread.id ? thread : existing))
    : [...threads, thread];
}

export function withoutComment(
  threads: DocumentCommentThread[],
  deleted: { id: string; parentId: string | null },
) {
  if (!deleted.parentId)
    return threads.filter((thread) => thread.id !== deleted.id);
  return threads.map((thread) =>
    thread.id === deleted.parentId
      ? {
          ...thread,
          replies: thread.replies.filter((reply) => reply.id !== deleted.id),
        }
      : thread,
  );
}

// The anchors a document save moved, as the server now stores them.
export function withAnchors(
  threads: DocumentCommentThread[],
  updates: readonly CommentAnchorUpdate[],
) {
  if (updates.length === 0) return threads;
  const anchors = new Map(updates.map(({ id, ...anchor }) => [id, anchor]));
  return threads.map((thread) => {
    const anchor = anchors.get(thread.id);
    return anchor ? { ...thread, anchor } : thread;
  });
}
