import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { focusIsFree } from "./focus-is-free";

// The list's direct child (row) that holds `target`, as an index.
function rowIndex(list: HTMLElement, target: EventTarget | null) {
  let node = target instanceof Node ? target : null;
  while (node && node.parentNode !== list) node = node.parentNode;
  return node ? Array.prototype.indexOf.call(list.children, node) : -1;
}

/**
 * Applying or dismissing a suggestion removes its row and the button that
 * had focus. Focus then moves to the row that took its place, or the row
 * before it when it was the last, onto its Apply (else first button);
 * with no rows left, to `emptyRef`. It moves only when focus fell to the
 * page, never away from where someone went meanwhile.
 *
 * `rowIds` lists the rows in the order the list renders them.
 */
export function useSuggestionFocus(
  listRef: RefObject<HTMLElement | null>,
  rowIds: readonly string[],
  emptyRef: RefObject<HTMLElement | null>,
) {
  const renderedIds = useRef(rowIds);
  const focusedId = useRef<string | null>(null);
  const listShown = rowIds.length > 0;

  useEffect(() => {
    const list = listRef.current;
    if (!listShown || !list) return;
    const onFocusIn = (event: FocusEvent) => {
      focusedId.current =
        renderedIds.current[rowIndex(list, event.target)] ?? null;
    };
    // A removed row takes focus nowhere (no relatedTarget); anywhere else
    // means someone moved on.
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget && !list.contains(event.relatedTarget as Node))
        focusedId.current = null;
    };
    list.addEventListener("focusin", onFocusIn);
    list.addEventListener("focusout", onFocusOut);
    return () => {
      list.removeEventListener("focusin", onFocusIn);
      list.removeEventListener("focusout", onFocusOut);
    };
  }, [listRef, listShown]);

  useLayoutEffect(() => {
    const previous = renderedIds.current;
    renderedIds.current = rowIds;
    const id = focusedId.current;
    if (id === null || rowIds.includes(id)) return;
    focusedId.current = null;
    if (!focusIsFree(null)) return;
    if (rowIds.length === 0) {
      emptyRef.current?.focus();
      return;
    }
    // The rows kept from before the removed one; the next row sits after them.
    const kept = previous
      .slice(0, Math.max(previous.indexOf(id), 0))
      .filter((rowId) => rowIds.includes(rowId)).length;
    const row = listRef.current?.children[Math.min(kept, rowIds.length - 1)];
    const target =
      row?.querySelector<HTMLElement>("[data-suggestion-action]") ??
      row?.querySelector<HTMLElement>("button") ??
      listRef.current;
    target?.focus();
  }, [rowIds, listRef, emptyRef]);
}
