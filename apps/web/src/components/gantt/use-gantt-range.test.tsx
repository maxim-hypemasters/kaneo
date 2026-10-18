import { act, renderHook } from "@testing-library/react";
import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { ScheduledTask } from "./gantt-types";
import {
  GANTT_CHUNK_DAYS,
  GANTT_FIRST_DAY,
  GANTT_MAX_DAYS,
  GANTT_MIN_DAYS,
} from "./timeline";
import { useGanttRange } from "./use-gantt-range";

// 2.75rem day columns at jsdom's 16px root font size.
const DAY_PX = 44;
const RAIL_PX = 320;

function task(
  start: string,
  end: string,
  projectId = "project",
): ScheduledTask {
  return {
    id: `${projectId}-${start}`,
    title: start,
    number: 1,
    description: null,
    status: "to-do",
    priority: null,
    startDate: start,
    dueDate: end,
    position: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    userId: null,
    assigneeId: null,
    assigneeName: null,
    projectId,
    scheduleStart: parseISO(start),
    scheduleEnd: parseISO(end),
  };
}

// A scroll container whose content width follows the rendered day count.
function scroller(viewportPx = 1100) {
  const element = document.createElement("div");
  const state = { left: 0, days: 0 };
  const maxLeft = () => Math.max(0, RAIL_PX + state.days * DAY_PX - viewportPx);
  Object.defineProperties(element, {
    clientWidth: { value: viewportPx },
    scrollWidth: {
      get: () => Math.max(viewportPx, RAIL_PX + state.days * DAY_PX),
    },
    scrollLeft: {
      get: () => state.left,
      set: (value: number) => {
        state.left = Math.max(0, Math.min(value, maxLeft()));
      },
    },
  });
  element.scrollTo = ((options: ScrollToOptions) => {
    element.scrollLeft = options.left ?? 0;
  }) as typeof element.scrollTo;
  return { element, state };
}

type Props = {
  tasks: ScheduledTask[];
  ready?: boolean;
  element: HTMLElement | null;
};

function setup(initial: Props, viewportPx?: number) {
  const { element, state } = scroller(viewportPx);
  const props: Props = { ...initial, element: initial.element ?? element };
  const hook = renderHook(
    ({ tasks, ready = true, element: scrollElement }: Props) => {
      const result = useGanttRange({
        projectId: "project",
        tasks,
        ready,
        weekStartsOn: 1,
        dayColumnWidthRem: 2.75,
        railWidthRem: 20,
        scrollElement,
      });
      state.days = result.timeline?.days.length ?? 0;
      return result;
    },
    { initialProps: props },
  );
  // Re-render once more so the layout effects see the element's content size
  // for the days just rendered.
  hook.rerender(props);
  return { hook, element, state, props };
}

type Hook = ReturnType<typeof setup>["hook"];

const firstDay = (hook: Hook) =>
  hook.result.current.timeline?.rangeStart ?? new Date(Number.NaN);
const leftmostVisible = (hook: Hook, element: HTMLElement) =>
  addDays(firstDay(hook), Math.round(element.scrollLeft / DAY_PX));

function scrollTo(element: HTMLElement, left: number) {
  act(() => {
    element.scrollLeft = left;
    element.dispatchEvent(new Event("scroll"));
  });
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useGanttRange", () => {
  it("adds room before the start on open without moving the visible dates", () => {
    const { hook, element } = setup({
      tasks: [task("2026-09-14", "2026-09-18")],
      element: null,
    });

    // Opened at scrollLeft 0, so the start grew by a chunk and the scroll
    // moved by exactly that many days.
    expect(hook.result.current.timeline?.days).toHaveLength(
      GANTT_MIN_DAYS + GANTT_CHUNK_DAYS,
    );
    expect(firstDay(hook)).toEqual(
      addDays(parseISO("2026-09-07"), -GANTT_CHUNK_DAYS),
    );
    expect(element.scrollLeft).toBe(GANTT_CHUNK_DAYS * DAY_PX);
    expect(leftmostVisible(hook, element)).toEqual(parseISO("2026-09-07"));
  });

  it("keeps growing at the end and trims the start past the cap", () => {
    const { hook, element } = setup({
      tasks: [task("2026-09-14", "2026-09-18")],
      element: null,
    });
    const nearEnd = () =>
      element.scrollWidth - element.clientWidth - 5 * DAY_PX;

    scrollTo(element, nearEnd());
    expect(hook.result.current.timeline?.days).toHaveLength(GANTT_MAX_DAYS);

    const before = firstDay(hook);
    const target = nearEnd();
    const visibleAtTarget = addDays(before, target / DAY_PX);
    scrollTo(element, target);

    expect(hook.result.current.timeline?.days).toHaveLength(GANTT_MAX_DAYS);
    expect(differenceInCalendarDays(firstDay(hook), before)).toBe(
      GANTT_CHUNK_DAYS,
    );
    // Trimming the start moved the scroll back by the trimmed days, so the
    // same day is still at the left of the viewport.
    expect(leftmostVisible(hook, element)).toEqual(visibleAtTarget);
  });

  it("reports the visible days to its viewport store", () => {
    const { hook, element } = setup({
      tasks: [task("2026-09-14", "2026-09-18")],
      element: null,
    });

    const visible = hook.result.current.viewport.get();
    expect(visible?.first).toEqual(leftmostVisible(hook, element));
    // (1100 - 320) / 44 = 17 whole days fit next to the rail.
    expect(
      visible && differenceInCalendarDays(visible.last, visible.first),
    ).toBe(16);
  });

  it("waits for the whole board before choosing the opening span", () => {
    const { hook, element, props } = setup({
      tasks: [task("2026-01-05", "2026-01-09")],
      ready: false,
      element: null,
    });
    // While pages stream in, the span follows them and doesn't grow.
    expect(firstDay(hook)).toEqual(parseISO("2025-12-29"));
    expect(element.scrollLeft).toBe(0);

    const fullBoard = [
      task("2026-01-05", "2026-01-09"),
      task("2026-10-05", "2026-10-30"),
    ];
    hook.rerender({ ...props, tasks: fullBoard, ready: true });

    // Chosen from the whole board (Dec 29 to Nov 29), not just the first
    // page (which would end in June); opening at the left edge then grows
    // the start and trims the far end to stay within the cap.
    expect(hook.result.current.timeline?.rangeEnd.getTime()).toBeGreaterThan(
      parseISO("2026-09-01").getTime(),
    );

    // Once chosen, later task changes don't move it.
    const chosen = firstDay(hook);
    hook.rerender({
      ...props,
      tasks: [...fullBoard, task("2024-01-01", "2024-01-02")],
      ready: true,
    });
    expect(firstDay(hook)).toEqual(chosen);
  });

  it("re-centres on a far date and scrolls it to the left edge", () => {
    const { hook, element } = setup({
      tasks: [task("2026-09-14", "2026-09-18")],
      element: null,
    });

    act(() => {
      hook.result.current.scrollToDate(parseISO("2031-06-18"), "start");
    });

    expect(leftmostVisible(hook, element)).toEqual(parseISO("2031-06-18"));
  });

  it("re-centres a rendered date too close to the end to be aligned", () => {
    const { hook, element } = setup({
      tasks: [task("2026-09-14", "2026-09-18")],
      element: null,
    });
    const timeline = hook.result.current.timeline;
    if (!timeline) throw new Error("no timeline");
    const nearLastDay = addDays(timeline.rangeEnd, -3);

    act(() => {
      hook.result.current.scrollToDate(nearLastDay, "start", "auto");
    });

    // Scrolling there in place would have been clamped short of it.
    expect(leftmostVisible(hook, element)).toEqual(nearLastDay);
  });

  it("doesn't grow under its own smooth scroll until the scroll ends", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { hook, element } = setup({
      tasks: [task("2026-09-14", "2026-09-18")],
      element: null,
    });
    const timeline = hook.result.current.timeline;
    if (!timeline) throw new Error("no timeline");
    const days = timeline.days.length;

    // A reachable date inside the edge zone at the end, smoothly.
    const target = addDays(
      timeline.rangeStart,
      Math.floor((element.scrollWidth - element.clientWidth) / DAY_PX) - 2,
    );
    act(() => {
      hook.result.current.scrollToDate(target, "start", "smooth");
      element.dispatchEvent(new Event("scroll"));
    });
    expect(hook.result.current.timeline?.days.length).toBe(days);

    act(() => {
      element.dispatchEvent(new Event("scrollend"));
    });
    expect(hook.result.current.timeline?.days.length).toBeGreaterThan(days);
  });

  it("restores the visible days after the scroll container remounts", () => {
    const { hook, element, props } = setup({
      tasks: [task("2026-09-14", "2026-09-18")],
      element: null,
    });
    scrollTo(element, element.scrollLeft + 30 * DAY_PX);
    const visible = leftmostVisible(hook, element);

    hook.rerender({ ...props, element: null });
    const { element: next, state } = scroller();
    state.days = hook.result.current.timeline?.days.length ?? 0;
    hook.rerender({ ...props, element: next });

    expect(leftmostVisible(hook, next)).toEqual(visible);
  });

  it("never ping-pongs on a viewport wider than the usual cap", () => {
    // About 290 days fit: more than GANTT_MAX_DAYS minus a chunk and edges.
    const { hook, element } = setup(
      { tasks: [task("2026-09-14", "2026-09-18")], element: null },
      13_000,
    );

    const settled = hook.result.current.timeline?.days.length ?? 0;
    expect(settled).toBeGreaterThan(GANTT_MAX_DAYS);
    scrollTo(element, element.scrollLeft);
    expect(hook.result.current.timeline?.days.length).toBe(settled);
  });

  it("clamps jumps before the first supported day", () => {
    const { hook } = setup({
      tasks: [task("2026-09-14", "2026-09-18")],
      element: null,
    });

    act(() => {
      hook.result.current.scrollToDate(new Date(-62_200_000_000_000));
    });

    expect(firstDay(hook)).toEqual(GANTT_FIRST_DAY);
  });

  it("opens on the extra spans as well as the tasks, once they're ready", () => {
    const tasks = [task("2026-09-14", "2026-09-18")];
    type Span = { scheduleStart: Date; scheduleEnd: Date };
    const release: Span = {
      scheduleStart: parseISO("2026-08-17"),
      scheduleEnd: parseISO("2027-05-01"),
    };
    const noSpans: Span[] = [];
    const { result, rerender } = renderHook(
      ({ extraSpans, ready }: { extraSpans: Span[]; ready: boolean }) =>
        useGanttRange({
          projectId: "project",
          tasks,
          extraSpans,
          ready,
          weekStartsOn: 1,
          dayColumnWidthRem: 2.75,
          railWidthRem: 20,
          scrollElement: null,
        }),
      { initialProps: { extraSpans: noSpans, ready: false } },
    );
    expect(result.current.timeline?.rangeStart).toEqual(parseISO("2026-09-07"));

    rerender({ extraSpans: [release], ready: true });

    // A week before the release's first week to four weeks after its last.
    expect(result.current.timeline?.rangeStart).toEqual(parseISO("2026-08-10"));
    expect(result.current.timeline?.rangeEnd).toEqual(parseISO("2027-05-30"));

    rerender({ extraSpans: noSpans, ready: true });
    expect(result.current.timeline?.rangeStart).toEqual(parseISO("2026-08-10"));
  });

  it("doesn't open a chart on extra spans alone", () => {
    const { result } = renderHook(() =>
      useGanttRange({
        projectId: "project",
        tasks: [],
        extraSpans: [
          {
            scheduleStart: parseISO("2026-10-01"),
            scheduleEnd: parseISO("2026-10-20"),
          },
        ],
        ready: true,
        weekStartsOn: 1,
        dayColumnWidthRem: 2.75,
        railWidthRem: 20,
        scrollElement: null,
      }),
    );

    expect(result.current.timeline).toBeNull();
  });

  it("does nothing without a scroll container to measure", () => {
    const { result } = renderHook(() =>
      useGanttRange({
        projectId: "project",
        tasks: [task("2026-09-14", "2026-09-18")],
        ready: true,
        weekStartsOn: 1,
        dayColumnWidthRem: 2.75,
        railWidthRem: 20,
        scrollElement: null,
      }),
    );

    expect(result.current.timeline?.days).toHaveLength(GANTT_MIN_DAYS);
    expect(result.current.viewport.get()).toBeNull();
  });
});
