import { useEffect, useLayoutEffect, useRef } from "react";

// Pixels per wheel "line" for mice that report in lines (deltaMode 1).
const LINE_PX = 40;

type WheelScrollOptions = {
  onZoom?: (deltaPx: number, clientX: number) => void;
  isZoomBlocked?: () => boolean;
};

// Shift+wheel zooms time around the pointer. Every other wheel is left to
// the browser, so the chart scrolls whichever way the wheel or trackpad
// moves (a Magic Mouse moves both ways at once); Ctrl/⌘+wheel is its zoom.
export function useWheelZoomsTime(
  element: HTMLElement | null,
  options: WheelScrollOptions = {},
) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    if (!element) return;
    let frame: number | null = null;
    let delta = 0;
    let pointerX = 0;
    const activePointers = new Set<number>();
    const cancelZoom = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      delta = 0;
    };
    const zoomBlocked = () =>
      activePointers.size > 0 ||
      element.hasAttribute("data-panning") ||
      latest.current.isZoomBlocked?.() === true;
    const onWheel = (event: WheelEvent) => {
      const overRail =
        event.target instanceof Element &&
        event.target.closest("[data-gantt-rail]");
      if (event.ctrlKey || event.metaKey || overRail) {
        cancelZoom();
        return;
      }
      const unit =
        event.deltaMode === 1
          ? LINE_PX
          : event.deltaMode === 2
            ? element.clientWidth
            : 1;
      if (event.shiftKey && latest.current.onZoom) {
        // Some devices remap Shift+wheel to the horizontal axis.
        const amount =
          Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? event.deltaX
            : event.deltaY;
        event.preventDefault();
        if (event.buttons !== 0 || zoomBlocked()) {
          cancelZoom();
          return;
        }
        delta += amount * unit;
        pointerX = event.clientX;
        if (frame === null && delta !== 0) {
          frame = requestAnimationFrame(() => {
            frame = null;
            const amount = delta;
            delta = 0;
            if (amount !== 0 && !zoomBlocked()) {
              latest.current.onZoom?.(amount, pointerX);
            }
          });
        }
        return;
      }
      cancelZoom();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") cancelZoom();
    };
    const onPointerDown = (event: PointerEvent) => {
      activePointers.add(event.pointerId);
      cancelZoom();
    };
    const onPointerEnd = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
    };
    const onBlur = () => {
      activePointers.clear();
      cancelZoom();
    };
    // Not passive: a zoom gesture must not also scroll the page/chart.
    element.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerEnd, true);
    window.addEventListener("blur", onBlur);
    return () => {
      cancelZoom();
      activePointers.clear();
      element.removeEventListener("wheel", onWheel);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [element]);
}
