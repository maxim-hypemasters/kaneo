import { addDays, differenceInCalendarDays } from "date-fns";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AssigneeAvatar } from "@/components/task/properties/assignee-avatar";
import { cn } from "@/lib/cn";
import { GanttFeatureBarLabel } from "./gantt-feature-bar-label";
import { GanttLaneHint } from "./gantt-lane-hint";
import { laneKeyAtPoint } from "./gantt-lane-dom";
import { GanttResizeHandle } from "./gantt-resize-handle";
import { GanttSummaryShape } from "./gantt-summary-shape";
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
// a slightly wobbly reschedule never moves a task to another lane by accident.
const LANE_ENGAGE_PX = 22;
// The avatar plus the move button's padding and the bar's inset; resize
// handles take their own width on top.
const AVATAR_ROOM_PX = 48;

type GanttTaskBarProps = {
  task: ScheduledTask;
  timeline: Pick<GanttTimeline, "days" | "rangeStart" | "gridTemplateColumns">;
  pixelsPerDay: number;
  isMobile?: boolean;
  // Present only when the bar may be dragged into another lane (assignee or
  // feature).
  laneDrag?: GanttLaneDrag;
  onCommit: (edit: GanttTaskEdit) => void;
  onOpenTask: () => void;
  // Told when a move or resize starts showing new dates, and when it ends.
  onDragChange?: (dragging: boolean) => void;
  // Read out with the bar, e.g. that it starts before a blocker ends.
  dependencyNote?: string;
  // Starts a task's bar with its assignee's avatar, for lanes that don't
  // say who does the work (grouped by feature).
  showAssignee?: boolean;
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
  onDragChange,
  dependencyNote,
  showAssignee = false,
}: GanttTaskBarProps) {
  const { t } = useTranslation();
  const noteId = useId();
  const assigneeId = useId();
  const progressId = useId();
  const [dragDisplay, setDragDisplay] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  const [laneView, setLaneView] = useState<LaneView | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // Pointer handlers outlive the render that created them (the route
  // re-renders while a lane is highlighted), so they read the latest props
  // from here instead of their closure.
  const latestRef = useRef({
    task,
    laneDrag,
    onCommit,
    onOpenTask,
    onDragChange,
  });
  useLayoutEffect(() => {
    latestRef.current = {
      task,
      laneDrag,
      onCommit,
      onOpenTask,
      onDragChange,
    };
  });
  // Ends an in-flight move gesture; called if the bar unmounts mid-drag
  // (e.g. a realtime update moved the task) so no window listener leaks.
  const endGestureRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endGestureRef.current?.(), []);

  const displayStart = dragDisplay?.start ?? task.scheduleStart;
  const displayEnd = dragDisplay?.end ?? task.scheduleEnd;

  const trackCount = timeline.days.length;
  const { barInView, lineStart, lineEnd, clippedStart, clippedEnd } =
    getBarGridColumns(
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
    commit({
      start,
      end,
      userId: current.userId || null,
      featureId: current.featureId ?? null,
    });
  };

  // Reports a gesture's drag to the route once, and its end once.
  const dragReporter = () => {
    let reported = false;
    return {
      start() {
        if (reported) return;
        reported = true;
        latestRef.current.onDragChange?.(true);
      },
      end() {
        if (!reported) return;
        reported = false;
        latestRef.current.onDragChange?.(false);
      },
    };
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
    const drag = dragReporter();

    const onMove = (ev: PointerEvent) => {
      drag.start();
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
      drag.end();
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
    const drag = dragReporter();

    const onMove = (ev: PointerEvent) => {
      drag.start();
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
      drag.end();
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
    if (target.kind === "feature") {
      if (!target.droppable) {
        return t("tasks:gantt.featureLanes.cannotMove", { name: target.name });
      }
      return target.featureId
        ? t("tasks:gantt.featureLanes.moveTo", { name: target.name })
        : t("tasks:gantt.featureLanes.remove");
    }
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
    const drag = dragReporter();
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
      drag.end();
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
        drag.start();
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
      const dropLane = target?.droppable ? target : null;
      commit({
        start,
        end: due,
        userId:
          dropLane?.kind === "assignee"
            ? dropLane.userId
            : current.userId || null,
        featureId:
          dropLane?.kind === "feature"
            ? dropLane.featureId
            : (current.featureId ?? null),
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

  const isFeature = task.type === "feature";
  const counts = isFeature ? task.subtaskCounts : undefined;
  const progress =
    counts && counts.total > 0
      ? {
          text: t("tasks:gantt.featureBar.progress", {
            completed: counts.completed,
            total: counts.total,
          }),
          aria: t("tasks:gantt.featureBar.progressAria", {
            completed: counts.completed,
            count: counts.total,
          }),
        }
      : null;
  const assigneeNote =
    showAssignee && !isFeature
      ? task.userId
        ? t("tasks:gantt.featureLanes.assignee", {
            name: task.assigneeName?.trim() || t("common:people.unknown"),
          })
        : t("tasks:assignee.unassigned")
      : null;
  // A one-day bar on a desktop has no room for it beside the handles.
  const showAvatar =
    assigneeNote !== null &&
    barWidthPx >=
      AVATAR_ROOM_PX + (showResizeHandles ? (isMobile ? 48 : 16) : 0);
  const describedBy =
    // The dependency note goes first: it ends in a full stop, so a screen
    // reader pauses before the assignee or progress note that follows.
    [
      dependencyNote && noteId,
      assigneeNote && assigneeId,
      progress && progressId,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  const ariaLabel = isFeature
    ? laneDrag?.kind === "assignee"
      ? t("tasks:gantt.featureBar.ariaLabelGrouped", { title: task.title })
      : t("tasks:gantt.featureBar.ariaLabel", { title: task.title })
    : laneDrag?.kind === "feature"
      ? t("tasks:gantt.featureLanes.taskAriaLabel", { title: task.title })
      : laneDrag
        ? t("tasks:gantt.taskAriaLabelGrouped", { title: task.title })
        : t("tasks:gantt.taskAriaLabel", { title: task.title });

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
        data-gantt-bar={isFeature ? "feature" : "task"}
        style={{ gridColumn: `${lineStart} / ${lineEnd}` }}
        className={cn(
          "relative mx-1 flex min-h-[44px] min-w-0 items-stretch text-left sm:h-11 sm:min-h-0",
          // A feature keeps a task bar's hit area but only draws the thinner
          // summary band inside it; the band carries the hover, focus and
          // lifted styles instead.
          isFeature
            ? "group/bar"
            : "group overflow-hidden rounded-md border border-primary/25 bg-background text-sm font-medium leading-none text-foreground shadow-sm transition-colors hover:border-primary/40",
          !isFeature && laneView && "shadow-lg ring-2 ring-primary/40",
          laneView ? "pointer-events-none" : "pointer-events-auto",
        )}
      >
        {isFeature && (
          // Centred in the row, so dependency arrows still meet its ends.
          <GanttSummaryShape
            clippedStart={clippedStart}
            clippedEnd={clippedEnd}
            className={cn(
              "inset-x-0 top-1/2 h-6 -translate-y-1/2 shadow-sm group-hover/bar:bg-primary/85",
              "group-has-[:focus-visible]/bar:ring-2 group-has-[:focus-visible]/bar:ring-ring group-has-[:focus-visible]/bar:ring-offset-2 group-has-[:focus-visible]/bar:ring-offset-background",
              laneView &&
                "shadow-lg ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
            )}
          />
        )}
        {showResizeHandles && (
          <GanttResizeHandle
            edge="start"
            label={t("tasks:gantt.resizeStart")}
            disabled={!startIsVisible}
            summary={isFeature}
            onPointerDown={handleResizeLeftPointerDown}
          />
        )}
        <button
          type="button"
          aria-label={ariaLabel}
          aria-describedby={describedBy}
          className={cn(
            "relative z-10 min-h-[44px] min-w-0 flex-1 cursor-grab touch-manipulation overflow-hidden px-2 text-left active:cursor-grabbing sm:min-h-0 sm:px-2.5",
            isFeature && "flex items-center focus-visible:outline-hidden",
          )}
          onPointerDown={handleMovePointerDown}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenTask();
            }
          }}
        >
          {isFeature ? (
            <GanttFeatureBarLabel
              title={task.title}
              progress={progress?.text ?? null}
              textOutside={labelOutside}
            />
          ) : (
            <>
              <div className="absolute inset-0 z-0 bg-primary/12 transition-colors group-hover:bg-primary/18" />
              <span className="relative z-10 flex min-w-0 items-center gap-1.5">
                {showAvatar && (
                  <span aria-hidden="true" data-gantt-bar-avatar="">
                    <AssigneeAvatar
                      name={task.assigneeName}
                      image={task.assigneeImage}
                      assigned={!!task.userId}
                      className="size-5"
                      fallbackClassName="text-[9px]"
                    />
                  </span>
                )}
                <span
                  className={cn(
                    "block min-w-0 truncate",
                    labelOutside && "sr-only",
                  )}
                >
                  {task.title}
                </span>
              </span>
            </>
          )}
        </button>
        {/* Hidden, not sr-only: read as the button's description, never a
            second time as loose text after it. */}
        {assigneeNote && (
          <span id={assigneeId} hidden>
            {assigneeNote}
          </span>
        )}
        {progress && (
          <span id={progressId} hidden>
            {progress.aria}
          </span>
        )}
        {dependencyNote && (
          <span id={noteId} hidden>
            {dependencyNote}
          </span>
        )}
        {showResizeHandles && (
          <GanttResizeHandle
            edge="end"
            label={t("tasks:gantt.resizeDue")}
            disabled={!endIsVisible}
            summary={isFeature}
            onPointerDown={handleResizeRightPointerDown}
          />
        )}
      </div>
      {labelOutside && (
        <span
          aria-hidden="true"
          style={{ gridColumn: `${lineEnd} / ${trackCount + 1}` }}
          className={cn(
            "min-w-0 truncate pl-1 text-xs text-foreground/80",
            isFeature ? "font-semibold" : "font-medium",
          )}
        >
          {task.title}
          {progress && (
            <span className="ml-1 font-medium tabular-nums text-muted-foreground">
              {progress.text}
            </span>
          )}
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
