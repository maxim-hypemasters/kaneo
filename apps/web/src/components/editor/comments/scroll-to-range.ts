import type { Editor } from "@tiptap/core";
import type { CommentRange } from "./comment-anchor";

const EDGE_MARGIN = 24;

function scrollParent(element: HTMLElement) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    )
      return node;
  }
  return null;
}

// Brings a range into view, a third of the way down its scroller, unless it
// is already comfortably visible.
export function scrollToRange(editor: Editor, range: CommentRange) {
  const { view } = editor;
  const scroller = scrollParent(view.dom);
  if (!scroller) return;
  const size = view.state.doc.content.size;
  const top = view.coordsAtPos(Math.min(range.from, size), 1).top;
  const bottom = view.coordsAtPos(Math.min(range.to, size), -1).bottom;
  const viewport = scroller.getBoundingClientRect();
  if (
    top >= viewport.top + EDGE_MARGIN &&
    bottom <= viewport.top + scroller.clientHeight - EDGE_MARGIN
  )
    return;
  // Move this scroller only; scrollIntoView would also scroll every ancestor,
  // such as the dialog a document window is opened in.
  scroller.scrollTo({
    top: Math.max(
      0,
      scroller.scrollTop + top - viewport.top - scroller.clientHeight / 3,
    ),
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
}
