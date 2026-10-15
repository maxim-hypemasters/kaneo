import { addDays, differenceInCalendarDays } from "date-fns";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { GanttLaneHint } from "./gantt-lane-hint";
import { laneKeyAtPoint } from "./gantt-lane-dom";
import type {
  GanttLaneDrag,
  GanttLaneTarget,
  GanttTaskEdit,
  ScheduledTask,
} from "./gantt-types";
import { type GanttTimeline, getBarGridColumns } from "./timeline";

const CLICK_MOVE_THRESHOLD_PX = 4;
const MOBILE_MOVE_THRESHOLD_PX = 14;
const MIN_INLINE_LABEL_PX = 120;
// Below this width a phone bar can't fit two 24px resize handles plus a
// usable move/tap area, so it's left as one target; dates stay editable from
// the task sheet.
const MIN_TOUCH_RESIZABLE_PX = 120;
// Vertical travel (half a row) before a drag starts targeting other lanes, so
// a slightly wobbly reschedule never reassigns a task by accident.
const LANE_ENGAGE_PX = 22;

type GanttTaskBarProps = {
  task: ScheduledTask;
  timeline: Pick<GanttTimeline, "days" | "rangeStart" | "gridTemplateColumns">;
  pixelsPerDay: number;
  isMobile?: boolean;
  // Present only when the bar may be dragged into another assignee lane.
  laneDrag?: GanttLaneDrag;
  onCommit: (edit: GanttTaskEdit) => void;
  onOpenTask: () => void;
};

type LaneView = {
  offsetY: number;
  hint: { x: number; y: number; label: string; disabled: boolean } | null;
};

// The bar may only travel within the lanes, so the transform never grows the
// scroll area. Both rects scroll together, so offsets measured once at
// pointerdown stay valid for the whole gesture.
function verticalDragBounds(bar: HTMLElement | null) {
  const lanes = bar?.closest("[data-gantt-lanes]");
  if (!bar || !lanes) return { min: 0, max: 0 };
  const barRect = bar.getBoundingClientRect();
  const lanesRect = lanes.getBoundingClientRect();
  return {
    min: Math.min(0, lanesRect.top - barRect.top),
    max: Math.max(0, lanesRect.bottom - barRect.bottom),
  };
}

export function GanttTaskBar({
  task,
  timeline,
  pixelsPerDay,
  isMobile = false,
  laneDrag,
  onCommit,
  onOpenTask,
}: GanttTaskBarProps) {
  const { t } = useTranslation();
  const [dragDisplay, setDragDisplay] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  const [laneView, setLaneView] = useState<LaneView | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // Pointer handlers outlive the render that created them (the route
  // re-renders while a lane is highlighted), so they read the latest props
  // from here instead of their closure.
  const latestRef = useRef({ task, laneDrag, onCommit, onOpenTask });
  useLayoutEffect(() => {
    latestRef.current = { task, laneDrag, onCommit, onOpenTask };
  });
  // Ends an in-flight move gesture; called if the bar unmounts mid-drag
  // (e.g. a realtime update moved the task) so no window listener leaks.
  const endGestureRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endGestureRef.current?.(), []);

  const displayStart = dragDisplay?.start ?? task.scheduleStart;
  const displayEnd = dragDisplay?.end ?? task.scheduleEnd;

  const trackCount = timeline.days.length;
  const { barInView, lineStart, lineEnd } = getBarGridColumns(
    displayStart,
    displayEnd,
    timeline.rangeStart,
    trackCount,
  );

  const startIsVisible =
    differenceInCalendarDays(task.scheduleStart, timeline.rangeStart) >= 0;
  const endIsVisible =
    differenceInCalendarDays(task.scheduleEnd, timeline.rangeStart) <
    trackCount;

  const commitDates = (start: Date, end: Date) => {
    const { task: current, onCommit: commit } = latestRef.current;
    commit({ start, end, userId: current.userId || null });
  };

  const pxPerDay = Math.max(pixelsPerDay, 1e-6);
  const moveThresholdPx = isMobile
    ? MOBILE_MOVE_THRESHOLD_PX
    : CLICK_MOVE_THRESHOLD_PX;

  const handleResizeLeftPointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const initialStart = task.scheduleStart;
    const initialEnd = task.scheduleEnd;
    const startIdx = differenceInCalendarDays(
      initialStart,
      timeline.rangeStart,
    );
    const endIdx = differenceInCalendarDays(initialEnd, timeline.rangeStart);

    const onMove = (ev: PointerEvent) => {
      const deltaDays = Math.round((ev.clientX - originX) / pxPerDay);
      let nextStartIdx = startIdx + deltaDays;
      nextStartIdx = Math.max(0, Math.min(nextStartIdx, endIdx));
      const nextStart = timeline.days[nextStartIdx] ?? initialStart;
      const nextEnd = initialEnd;
      setDragDisplay({ start: nextStart, end: nextEnd });
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      setDragDisplay(null);
      if (ev.type === "pointercancel") return;
      const deltaDays = Math.round((ev.clientX - originX) / pxPerDay);
      let nextStartIdx = startIdx + deltaDays;
      nextStartIdx = Math.max(0, Math.min(nextStartIdx, endIdx));
      const nextStart = timeline.days[nextStartIdx] ?? initialStart;
      if (nextStart.getTime() === initialStart.getTime()) return;
      commitDates(nextStart, initialEnd);
    };

    const onCancel = onUp;

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  const handleResizeRightPointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const initialStart = task.scheduleStart;
    const initialEnd = task.scheduleEnd;
    const startIdx = differenceInCalendarDays(
      initialStart,
      timeline.rangeStart,
    );
    const endIdx = differenceInCalendarDays(initialEnd, timeline.rangeStart);

    const onMove = (ev: PointerEvent) => {
      const deltaDays = Math.round((ev.clientX - originX) / pxPerDay);
      let nextEndIdx = endIdx + deltaDays;
      nextEndIdx = Math.max(startIdx, Math.min(nextEndIdx, trackCount - 1));
      const nextEnd = timeline.days[nextEndIdx] ?? initialEnd;
      const nextStart = initialStart;
      setDragDisplay({ start: nextStart, end: nextEnd });
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      setDragDisplay(null);
      if (ev.type === "pointercancel") return;
      const deltaDays = Math.round((ev.clientX - originX) / pxPerDay);
      let nextEndIdx = endIdx + deltaDays;
      nextEndIdx = Math.max(startIdx, Math.min(nextEndIdx, trackCount - 1));
      const nextEnd = timeline.days[nextEndIdx] ?? initialEnd;
      if (nextEnd.getTime() === initialEnd.getTime()) return;
      commitDates(initialStart, nextEnd);
    };

    const onCancel = onUp;

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  const laneHintLabel = (target: GanttLaneTarget) => {
    if (!target.droppable) {
      return t("tasks:gantt.cannotAssign", { name: target.name });
    }
    return target.userId
      ? t("tasks:gantt.assignTo", { name: target.name })
      : t("tasks:gantt.unassign");
  };

  const handleMovePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    // A press always starts fresh, even if an earlier gesture lost its
    // release somewhere.
    endGestureRef.current?.();
    const originX = event.clientX;
    const originY = event.clientY;
    const initialStart = task.scheduleStart;
    const initialEnd = task.scheduleEnd;
    if (!startIsVisible || !endIsVisible) {
      onOpenTask();
      return;
    }
    // Touch drags pan the timeline instead (the browser cancels the
    // gesture), so lanes are only targeted by mouse and pen.
    const lane = event.pointerType === "touch" ? undefined : laneDrag;
    const durationDays = differenceInCalendarDays(initialEnd, initialStart);
    const startIdx = differenceInCalendarDays(
      initialStart,
      timeline.rangeStart,
    );
    const scrollContainer = lane
      ? (barRef.current?.closest<HTMLElement>(
          "[data-gantt-scroll-container]",
        ) ?? null)
      : null;
    const initialScrollTop = scrollContainer?.scrollTop ?? 0;
    const bounds = lane ? verticalDragBounds(barRef.current) : null;
    let pointer = { x: originX, y: originY };
    // undefined while no lane is targeted; otherwise the reported target key.
    let reportedTarget: string | null | undefined;
    // Set once the pointer itself has travelled past the click threshold.
    // Scrolling under a still pointer must never turn a click into a drag
    // (or, worse, into a reassignment to whichever lane scrolled under it).
    let dragging = false;
    const pointerTravel = (clientX: number, clientY: number) =>
      lane
        ? Math.max(Math.abs(clientX - originX), Math.abs(clientY - originY))
        : Math.abs(clientX - originX);

    const datesFor = (clientX: number) => {
      const deltaDays = Math.round((clientX - originX) / pxPerDay);
      const maxStart = trackCount - 1 - durationDays;
      const nextStartIdx = Math.max(
        0,
        Math.min(startIdx + deltaDays, maxStart),
      );
      const start = timeline.days[nextStartIdx] ?? initialStart;
      return { start, end: addDays(start, durationDays) };
    };

    // Vertical travel in content coordinates, so scrolling the timeline
    // mid-drag counts as moving through the lanes.
    const verticalOffset = (clientY: number) =>
      clientY - originY + (scrollContainer?.scrollTop ?? 0) - initialScrollTop;

    const laneTargetAt = (x: number, y: number) => {
      if (!lane) return null;
      const key = laneKeyAtPoint(x, y);
      if (!key || key === lane.laneKey) return null;
      // Lanes can change mid-drag (a realtime update, members loading), so
      // resolve against the latest ones.
      return (latestRef.current.laneDrag ?? lane).resolveLane(key);
    };

    const syncLane = () => {
      if (!lane || !dragging) return;
      const offset = verticalOffset(pointer.y);
      if (Math.abs(offset) < LANE_ENGAGE_PX) {
        if (reportedTarget !== undefined) {
          reportedTarget = undefined;
          lane.onChange(null);
        }
        setLaneView(null);
        return;
      }
      const target = laneTargetAt(pointer.x, pointer.y);
      const targetKey = target?.droppable ? target.key : null;
      if (targetKey !== reportedTarget) {
        reportedTarget = targetKey;
        lane.onChange({ taskId: task.id, targetLaneKey: targetKey });
      }
      setLaneView({
        offsetY: bounds
          ? Math.min(bounds.max, Math.max(bounds.min, offset))
          : offset,
        hint: target
          ? {
              x: pointer.x,
              y: pointer.y,
              label: laneHintLabel(target),
              disabled: !target.droppable,
            }
          : null,
      });
    };

    const end = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("contextmenu", end);
      if (lane) {
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("blur", end);
        scrollContainer?.removeEventListener("scroll", syncLane);
        if (reportedTarget !== undefined) lane.onChange(null);
      }
      endGestureRef.current = null;
      setDragDisplay(null);
      setLaneView(null);
    };

    const onMove = (ev: PointerEvent) => {
      // The release happened somewhere we never heard about (e.g. a context
      // menu swallowed it): drop the gesture instead of letting the next
      // unrelated click commit it.
      if (ev.pointerType === "mouse" && (ev.buttons & 1) === 0) {
        end();
        return;
      }
      pointer = { x: ev.clientX, y: ev.clientY };
      if (pointerTravel(ev.clientX, ev.clientY) >= moveThresholdPx) {
        dragging = true;
      }
      setDragDisplay(datesFor(ev.clientX));
      syncLane();
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.type === "pointercancel") {
        end();
        return;
      }
      const travelled =
        pointerTravel(ev.clientX, ev.clientY) >= moveThresholdPx;
      const isDrag = lane ? dragging || travelled : travelled;
      const dy = lane && isDrag ? verticalOffset(ev.clientY) : 0;
      // Hit-test before end(): the dragged bar is still click-through, so it
      // can't hide the lane underneath the pointer.
      const target =
        Math.abs(dy) >= LANE_ENGAGE_PX
          ? laneTargetAt(ev.clientX, ev.clientY)
          : null;
      end();
      const {
        task: current,
        onCommit: commit,
        onOpenTask: open,
      } = latestRef.current;
      if (!isDrag) {
        open();
        return;
      }
      const { start, end: due } = datesFor(ev.clientX);
      commit({
        start,
        end: due,
        userId: target?.droppable ? target.userId : current.userId || null,
      });
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      end();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("contextmenu", end);
    if (lane) {
      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("blur", end);
      scrollContainer?.addEventListener("scroll", syncLane, { passive: true });
    }
    endGestureRef.current = end;
  };

  if (!barInView || lineEnd <= lineStart) {
    return null;
  }

  // Short bars on phones leave no room for the title inside them, so it's
  // drawn just after the bar instead (when the timeline has room for it).
  const barWidthPx = (lineEnd - lineStart) * pxPerDay;
  const labelOutside =
    isMobile && barWidthPx < MIN_INLINE_LABEL_PX && lineEnd <= trackCount;
  const showResizeHandles = !isMobile || barWidthPx >= MIN_TOUCH_RESIZABLE_PX;

  return (
    <div
      ref={barRef}
      className={cn(
        "pointer-events-none absolute inset-0 grid items-center",
        laneView ? "z-[10]" : "z-[1]",
      )}
      style={{
        gridTemplateColumns: timeline.gridTemplateColumns,
        transform: laneView ? `translateY(${laneView.offsetY}px)` : undefined,
      }}
    >
      <div
        style={{ gridColumn: `${lineStart} / ${lineEnd}` }}
        className={cn(
          "group relative mx-1 flex min-h-[44px] min-w-0 items-stretch overflow-hidden rounded-md border border-primary/25 bg-background text-left text-sm font-medium leading-none text-foreground shadow-sm transition-colors hover:border-primary/40 sm:h-11 sm:min-h-0",
          laneView
            ? "pointer-events-none shadow-lg ring-2 ring-primary/40"
            : "pointer-events-auto",
        )}
      >
        {showResizeHandles && (
          <button
            type="button"
            aria-label={t("tasks:gantt.resizeStart")}
            disabled={!startIsVisible}
            onPointerDown={handleResizeLeftPointerDown}
            className={cn(
              "relative z-20 shrink-0 cursor-ew-resize touch-none border-r border-primary/15 bg-primary/8 hover:bg-primary/18",
              "min-h-[44px] w-6 sm:min-h-0 sm:w-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            )}
          />
        )}
        <button
          type="button"
          aria-label={
            laneDrag
              ? t("tasks:gantt.taskAriaLabelGrouped", { title: task.title })
              : t("tasks:gantt.taskAriaLabel", { title: task.title })
          }
          className="relative z-10 min-h-[44px] min-w-0 flex-1 cursor-grab touch-manipulation overflow-hidden px-2 text-left active:cursor-grabbing sm:min-h-0 sm:px-2.5"
          onPointerDown={handleMovePointerDown}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenTask();
            }
          }}
        >
          <div className="absolute inset-0 z-0 bg-primary/12 transition-colors group-hover:bg-primary/18" />
          <span
            className={cn(
              "relative z-10 block truncate",
              labelOutside && "sr-only",
            )}
          >
            {task.title}
          </span>
        </button>
        {showResizeHandles && (
          <button
            type="button"
            aria-label={t("tasks:gantt.resizeDue")}
            disabled={!endIsVisible}
            onPointerDown={handleResizeRightPointerDown}
            className={cn(
              "relative z-20 shrink-0 cursor-ew-resize touch-none border-l border-primary/15 bg-primary/8 hover:bg-primary/18",
              "min-h-[44px] w-6 sm:min-h-0 sm:w-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            )}
          />
        )}
      </div>
      {labelOutside && (
        <span
          aria-hidden="true"
          style={{ gridColumn: `${lineEnd} / ${trackCount + 1}` }}
          className="min-w-0 truncate pl-1 text-xs font-medium text-foreground/80"
        >
          {task.title}
        </span>
      )}
      {laneView?.hint && (
        <GanttLaneHint
          x={laneView.hint.x}
          y={laneView.hint.y}
          label={laneView.hint.label}
          disabled={laneView.hint.disabled}
        />
      )}
    </div>
  );
}
