import type { DocumentCommentThread } from "@/fetchers/document-comment/types";

export type ThreadFilter = "open" | "resolved";

// The threads a filter shows, in reading order: those found in the text by
// their place in it, then the detached ones, oldest first.
export function sortThreads(
  threads: readonly DocumentCommentThread[],
  filter: ThreadFilter,
  // Ids of the threads found in the document, in document order.
  attachedIds: readonly string[],
) {
  const place = new Map(attachedIds.map((id, index) => [id, index]));
  return threads
    .filter((thread) => Boolean(thread.resolvedAt) === (filter === "resolved"))
    .map((thread, index) => ({ thread, index }))
    .sort(
      (a, b) =>
        (place.get(a.thread.id) ?? Number.POSITIVE_INFINITY) -
          (place.get(b.thread.id) ?? Number.POSITIVE_INFINITY) ||
        a.index - b.index,
    )
    .map(({ thread }) => thread);
}
