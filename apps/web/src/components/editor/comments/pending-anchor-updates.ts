import { captureAnchor } from "./capture-anchor";
import type { CommentAnchorUpdate, CommentRange } from "./comment-anchor";
import type { TrackedThread } from "./comment-highlight-state";
import type { DocumentTextProjection } from "./document-text";

// The anchors that editing has made stale: threads still attached to text
// whose quote or surroundings no longer match what is stored. Detached threads
// keep their stored anchor, so the original quote stays on record.
export function pendingAnchorUpdates(
  projection: DocumentTextProjection,
  tracked: TrackedThread[],
  ranges: ReadonlyMap<string, CommentRange>,
): CommentAnchorUpdate[] {
  const updates: CommentAnchorUpdate[] = [];
  for (const { id, anchor } of tracked) {
    const range = ranges.get(id);
    const current = range && captureAnchor(projection, range.from, range.to);
    if (
      current &&
      (current.anchor.quote !== anchor.quote ||
        current.anchor.prefix !== anchor.prefix ||
        current.anchor.suffix !== anchor.suffix)
    )
      updates.push({ id, ...current.anchor });
  }
  return updates;
}
