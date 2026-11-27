import { type RefObject, useEffect } from "react";

/**
 * Answering a question or handling a suggestion removes the control that had
 * focus. When that drops focus to the page, move it to the container so
 * keyboard and screen reader users stay where they were working. Pass
 * `active` false while the container is not rendered; it starts watching
 * once it is.
 */
export function useFocusRescue(
  ref: RefObject<HTMLElement | null>,
  active = true,
) {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    let lastFocused: Element | null = null;
    const onFocusIn = (event: FocusEvent) => {
      lastFocused = event.target instanceof Element ? event.target : null;
    };
    const observer = new MutationObserver(() => {
      if (!lastFocused || lastFocused.isConnected) return;
      lastFocused = null;
      const focused = document.activeElement;
      if ((focused === null || focused === document.body) && root.isConnected)
        root.focus();
    });
    root.addEventListener("focusin", onFocusIn);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      observer.disconnect();
    };
  }, [ref, active]);
}
