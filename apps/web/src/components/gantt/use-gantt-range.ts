import { addDays, differenceInCalendarDays } from "date-fns";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { remToPx, shiftScrollLeft } from "./gantt-scroll";
import type { ScheduledTask } from "./gantt-types";
import { createGanttViewportStore } from "./gantt-viewport";
import {
  buildGanttTimeline,
  extendGanttRange,
  GANTT_CHUNK_DAYS,
  GANTT_FIRST_DAY,
  GANTT_LAST_DAY,
  GANTT_MAX_DAYS,
  type GanttRange,
  ganttRangeAround,
  initialGanttRange,
} from "./timeline";

// Grow the span once less than this many days are left beyond the viewport.
const EDGE_DAYS = 21;
// Browsers without `scrollend` get their smooth scroll treated as done after
// this long.
const SMOOTH_SCROLL_FALLBACK_MS = 1000;

export type GanttScrollAlign = "start" | "center";

type UseGanttRangeOptions = {
  projectId: string;
  tasks: readonly ScheduledTask[];
  // False while the board is still streaming in page by page: the opening
  // span must be decided on all of the project's tasks.
  ready: boolean;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  dayColumnWidthRem: number;
  // Width of the sticky task rail covering the left of the scroll viewport.
  railWidthRem: number;
  scrollElement: HTMLElement | null;
};

function prefersReducedMotion() {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

function clampDay(date: Date) {
  return date < GANTT_FIRST_DAY
    ? GANTT_FIRST_DAY
    : date > GANTT_LAST_DAY
      ? GANTT_LAST_DAY
      : date;
}

// The days the Gantt chart renders. It opens on the project's work and then
// grows a chunk at a time as the timeline is scrolled toward either edge,
// trimming the far side so the column count stays bounded. Every grow or
// trim moves the scroll position by the same amount, so the dates under the
// viewport never jump.
export function useGanttRange({
  projectId,
  tasks,
  ready,
  weekStartsOn,
  dayColumnWidthRem,
  railWidthRem,
  scrollElement,
}: UseGanttRangeOptions) {
  const initialRange = useMemo(
    () => initialGanttRange([...tasks], weekStartsOn),
    [tasks, weekStartsOn],
  );
  const [state, setState] = useState<{
    projectId: string;
    range: GanttRange;
  } | null>(null);
  const tasksBelongToProject = tasks[0]?.projectId === projectId;
  // Freeze the opening span per project once all of its tasks are in:
  // recomputing it whenever tasks change (a drag, a realtime update) would
  // slide the columns under the reader. Until then it follows the tasks
  // streaming in.
  if (
    ready &&
    initialRange &&
    tasksBelongToProject &&
    state?.projectId !== projectId
  ) {
    setState({ projectId, range: initialRange });
  }
  const frozen = state?.projectId === projectId;
  const range = frozen ? state.range : initialRange;
  const timeline = useMemo(
    () => (range ? buildGanttTimeline(range, dayColumnWidthRem) : null),
    [range, dayColumnWidthRem],
  );
  const [viewport] = useState(createGanttViewportStore);

  // Scroll adjustment owed by the last grow/trim, applied once the new
  // columns are in the DOM.
  const pendingShiftPxRef = useRef(0);
  // A date to bring into view once a re-centred span has rendered.
  const pendingScrollRef = useRef<{
    date: Date;
    align: GanttScrollAlign;
  } | null>(null);
  // While a smooth scroll we started is animating, growing the span would
  // jump scrollLeft under the animation and stop it short.
  const animatingRef = useRef(false);
  // The first visible day, to restore after the scroll container remounts
  // (e.g. a search that briefly matched nothing).
  const firstVisibleRef = useRef<{ projectId: string; date: Date } | null>(
    null,
  );
  const mountedElementRef = useRef<HTMLElement | null>(null);
  const latestRef = useRef({
    range,
    timeline,
    frozen,
    railWidthRem,
    dayColumnWidthRem,
  });
  useLayoutEffect(() => {
    latestRef.current = {
      range,
      timeline,
      frozen,
      railWidthRem,
      dayColumnWidthRem,
    };
  });

  const measure = useCallback(() => {
    const element = scrollElement;
    const {
      timeline: shown,
      railWidthRem: rail,
      dayColumnWidthRem: day,
    } = latestRef.current;
    if (!element || !shown || element.clientWidth === 0) {
      viewport.set(null);
      return;
    }
    const dayPx = remToPx(day);
    const lastIndex = shown.days.length - 1;
    const firstIndex = Math.min(
      Math.max(Math.round(element.scrollLeft / dayPx), 0),
      lastIndex,
    );
    const visibleDays = Math.max(
      1,
      Math.floor((element.clientWidth - remToPx(rail)) / dayPx),
    );
    const first = shown.days[firstIndex];
    viewport.set({
      first,
      last: shown.days[Math.min(firstIndex + visibleDays - 1, lastIndex)],
    });
    firstVisibleRef.current = { projectId, date: first };
  }, [projectId, scrollElement, viewport]);

  const watchSmoothScroll = useCallback((element: HTMLElement) => {
    animatingRef.current = true;
    let timer = 0;
    const done = () => {
      element.removeEventListener("scrollend", done);
      window.clearTimeout(timer);
      animatingRef.current = false;
      // Catch up on any growth skipped while animating.
      element.dispatchEvent(new Event("scroll"));
    };
    element.addEventListener("scrollend", done);
    timer = window.setTimeout(done, SMOOTH_SCROLL_FALLBACK_MS);
  }, []);

  const scrollToIndex = useCallback(
    (
      element: HTMLElement,
      index: number,
      align: GanttScrollAlign,
      behavior: ScrollBehavior,
    ) => {
      const { railWidthRem: rail, dayColumnWidthRem: day } = latestRef.current;
      const dayPx = remToPx(day);
      const visiblePx = element.clientWidth - remToPx(rail);
      const left =
        align === "start"
          ? index * dayPx
          : index * dayPx - (visiblePx - dayPx) / 2;
      const resolved = prefersReducedMotion() ? "auto" : behavior;
      if (resolved === "smooth") watchSmoothScroll(element);
      const options: ScrollToOptions = {
        left: Math.max(0, left),
        behavior: resolved,
      };
      if (typeof element.scrollTo === "function") element.scrollTo(options);
      else shiftScrollLeft(element, (options.left ?? 0) - element.scrollLeft);
    },
    [watchSmoothScroll],
  );

  const growTowardEdge = useCallback(() => {
    const element = scrollElement;
    const {
      range: current,
      timeline: shown,
      frozen: decided,
      railWidthRem: rail,
      dayColumnWidthRem: day,
    } = latestRef.current;
    // No layout (hidden, or a test DOM): nothing to measure against. Before
    // the opening span is decided there's nothing to grow either.
    if (!element || !current || !shown || element.clientWidth === 0) return;
    if (!decided || animatingRef.current || pendingShiftPxRef.current !== 0) {
      return;
    }
    const dayPx = remToPx(day);
    const daysLeft = element.scrollLeft / dayPx;
    const daysRight =
      (element.scrollWidth - element.scrollLeft - element.clientWidth) / dayPx;
    const side =
      daysLeft < EDGE_DAYS && shown.hasPrevious
        ? "start"
        : daysRight < EDGE_DAYS && shown.hasNext
          ? "end"
          : null;
    if (!side) return;
    // A very wide viewport (a huge screen, or zoomed far out) needs a bigger
    // cap, or trimming one side would land the other at its own edge and the
    // two would grow back and forth forever.
    const visibleDays = (element.clientWidth - remToPx(rail)) / dayPx;
    const maxDays = Math.max(
      GANTT_MAX_DAYS,
      Math.ceil(visibleDays) + 2 * (GANTT_CHUNK_DAYS + EDGE_DAYS),
    );
    const grown = extendGanttRange(current, side, maxDays);
    if (!grown) return;
    const otherSideDays = side === "start" ? daysRight : daysLeft;
    if (grown.trimmed > 0 && otherSideDays - grown.trimmed < EDGE_DAYS) return;
    pendingShiftPxRef.current =
      side === "start" ? grown.added * dayPx : -grown.trimmed * dayPx;
    setState({ projectId, range: grown.range });
  }, [projectId, scrollElement]);

  // After every render of a new span: restore the position after a remount,
  // settle the scroll position a grow owes, finish a pending jump, then check
  // whether an edge needs more room.
  useLayoutEffect(() => {
    const element = scrollElement;
    const remounted = element !== mountedElementRef.current;
    mountedElementRef.current = element;
    if (!element || !timeline) return;
    const remembered = firstVisibleRef.current;
    if (
      remounted &&
      remembered?.projectId === projectId &&
      !pendingScrollRef.current
    ) {
      pendingScrollRef.current = { date: remembered.date, align: "start" };
    }
    if (pendingShiftPxRef.current !== 0) {
      shiftScrollLeft(element, pendingShiftPxRef.current);
      pendingShiftPxRef.current = 0;
    }
    const pending = pendingScrollRef.current;
    if (pending) {
      pendingScrollRef.current = null;
      const index = differenceInCalendarDays(pending.date, timeline.rangeStart);
      scrollToIndex(
        element,
        Math.min(Math.max(index, 0), timeline.days.length - 1),
        pending.align,
        "auto",
      );
    }
    growTowardEdge();
    measure();
  }, [
    timeline,
    scrollElement,
    projectId,
    scrollToIndex,
    growTowardEdge,
    measure,
  ]);

  useEffect(() => {
    const element = scrollElement;
    if (!element) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        growTowardEdge();
        measure();
      });
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(onScroll)
        : null;
    observer?.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, [scrollElement, growTowardEdge, measure]);

  // Scrolls a date into view, re-centring the span on it first when it is
  // outside the rendered days or too close to their end to be aligned.
  const scrollToDate = useCallback(
    (
      date: Date,
      align: GanttScrollAlign = "start",
      behavior: ScrollBehavior = "smooth",
    ) => {
      const element = scrollElement;
      const {
        timeline: shown,
        frozen: decided,
        railWidthRem: rail,
        dayColumnWidthRem: day,
      } = latestRef.current;
      if (!element || !shown || !decided) return;
      const target = clampDay(date);
      const index = differenceInCalendarDays(target, shown.rangeStart);
      const dayPx = remToPx(day);
      const visiblePx = element.clientWidth - remToPx(rail);
      const left =
        align === "start"
          ? index * dayPx
          : index * dayPx - (visiblePx - dayPx) / 2;
      const reachable =
        index >= 0 &&
        index < shown.days.length &&
        // Without layout there's no scroll limit to respect.
        (element.clientWidth === 0 ||
          left <= element.scrollWidth - element.clientWidth + 1);
      if (reachable) {
        scrollToIndex(element, index, align, behavior);
        return;
      }
      pendingScrollRef.current = { date: target, align };
      pendingShiftPxRef.current = 0;
      setState({ projectId, range: ganttRangeAround(target, weekStartsOn) });
    },
    [projectId, scrollElement, scrollToIndex, weekStartsOn],
  );

  // Pages by most of the visible timeline width, going through scrollToDate
  // so a page past the rendered days re-centres instead of stopping short.
  const scrollByPage = useCallback(
    (direction: -1 | 1) => {
      const element = scrollElement;
      const {
        timeline: shown,
        railWidthRem: rail,
        dayColumnWidthRem: day,
      } = latestRef.current;
      if (!element || !shown) return;
      const dayPx = remToPx(day);
      const pageDays = Math.max(
        1,
        Math.floor(((element.clientWidth - remToPx(rail)) * 0.85) / dayPx),
      );
      const firstIndex = Math.round(element.scrollLeft / dayPx);
      scrollToDate(
        addDays(shown.rangeStart, firstIndex + direction * pageDays),
        "start",
      );
    },
    [scrollElement, scrollToDate],
  );

  return { timeline, viewport, scrollToDate, scrollByPage };
}
