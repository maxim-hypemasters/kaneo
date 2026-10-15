import { differenceInCalendarDays } from "date-fns";
import { useSyncExternalStore } from "react";

// The days currently on screen, or null while there's no layout to measure
// (nothing rendered yet, hidden, or a test DOM).
export type GanttViewport = { first: Date; last: Date } | null;

// Updated by the range hook as the timeline scrolls. Components subscribe
// with a selector that returns a primitive, so a scroll only re-renders the
// ones whose answer actually changed (the period controls, and rows whose
// task scrolls in or out of view) rather than the whole chart.
export function createGanttViewportStore() {
  let current: GanttViewport = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next: GanttViewport) {
      const unchanged =
        next === current ||
        (next !== null &&
          current !== null &&
          differenceInCalendarDays(next.first, current.first) === 0 &&
          differenceInCalendarDays(next.last, current.last) === 0);
      if (unchanged) return;
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type GanttViewportStore = ReturnType<typeof createGanttViewportStore>;

export function useGanttViewport<T extends string | number | boolean | null>(
  store: GanttViewportStore,
  select: (viewport: GanttViewport) => T,
): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(null),
  );
}
