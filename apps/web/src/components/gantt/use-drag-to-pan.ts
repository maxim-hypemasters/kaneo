import type React from "react";
import { useCallback, useEffect, useRef } from "react";

// Movement before a press on empty timeline space becomes a pan, so plain
// clicks there still behave as clicks.
const PAN_THRESHOLD_PX = 3;
// macOS overlay scrollbars take no layout space, so a press on one can't be
// told apart by size alone: treat a band along the trailing edges as the
// scrollbar.
const SCROLLBAR_BAND_PX = 12;
const INTERACTIVE =
  "button, a, input, select, textarea, label, [role='button'], [contenteditable='true']";

// Click-and-drag on empty timeline space scrolls the chart, for mice whose
// wheel only scrolls vertically. Touch already pans natively; bars, buttons
// and form controls keep their own drag/click behaviour.
export function useDragToPan() {
  const endRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endRef.current?.(), []);

  return useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || event.pointerType === "touch") return;
    const container = event.currentTarget;
    const target = event.target as Element;
    if (target.closest(INTERACTIVE)) return;
    // A press on the container's own scrollbar scrolls natively.
    if (target === container) {
      const bandX = Math.max(
        container.offsetWidth - container.clientWidth,
        SCROLLBAR_BAND_PX,
      );
      const bandY = Math.max(
        container.offsetHeight - container.clientHeight,
        SCROLLBAR_BAND_PX,
      );
      if (
        event.nativeEvent.offsetX >= container.offsetWidth - bandX ||
        event.nativeEvent.offsetY >= container.offsetHeight - bandY
      ) {
        return;
      }
    }
    endRef.current?.();
    // preventDefault stops text selection and native drags, but also the
    // focus change a click would make; do that part by hand so keys stop
    // going to whatever was focused before.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== document.body) {
      focused.blur();
    }
    event.preventDefault();

    const { pointerId } = event;
    let lastX = event.clientX;
    let lastY = event.clientY;
    const originX = event.clientX;
    const originY = event.clientY;
    let panning = false;

    const end = (ev?: Event) => {
      if (ev instanceof PointerEvent && ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
      delete container.dataset.panning;
      endRef.current = null;
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      // The release happened outside the page (or a menu swallowed it).
      if ((ev.buttons & 1) === 0) {
        end();
        return;
      }
      if (
        !panning &&
        Math.hypot(ev.clientX - originX, ev.clientY - originY) <
          PAN_THRESHOLD_PX
      ) {
        return;
      }
      if (!panning) {
        panning = true;
        container.dataset.panning = "";
      }
      // Incremental, so the timeline growing (and shifting scrollLeft) under
      // an ongoing pan doesn't make it jump.
      container.scrollLeft -= ev.clientX - lastX;
      container.scrollTop -= ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
    endRef.current = end;
  }, []);
}
