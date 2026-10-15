import { useEffect } from "react";
import { shiftScrollLeft } from "./gantt-scroll";

// Pixels per wheel "line" for mice that report in lines (deltaMode 1).
const LINE_PX = 40;

// A vertical mouse wheel over the timeline scrolls through time; over the
// task list (marked data-gantt-rail) it still scrolls the rows. Gestures that
// are already sideways (trackpad swipes, Shift+wheel) and Ctrl/⌘+wheel zoom
// are left to the browser.
export function useWheelScrollsTime(element: HTMLElement | null) {
  useEffect(() => {
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      if ((event.target as Element | null)?.closest("[data-gantt-rail]")) {
        return;
      }
      const unit =
        event.deltaMode === 1
          ? LINE_PX
          : event.deltaMode === 2
            ? element.clientWidth
            : 1;
      event.preventDefault();
      shiftScrollLeft(element, event.deltaY * unit);
    };
    // Not passive: the vertical scroll has to be cancelled.
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [element]);
}
