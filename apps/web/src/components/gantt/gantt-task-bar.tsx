import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { addDays, differenceInCalendarDays } from "date-fns";
import { Check } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AssigneeAvatar } from "@/components/task/properties/assignee-avatar";
import { cn } from "@/lib/cn";
import { getStatusLabel } from "@/lib/i18n/domain";
import { GANTT_BAR_STYLES } from "./gantt-bar-style";
import { GanttResizeHandle } from "./gantt-resize-handle";
import { canDropIntoMilestone } from "./group-gantt-tasks-by-milestone";
import { GanttMilestoneBarLabel } from "./gantt-milestone-bar-label";
import { GanttLaneHint } from "./gantt-lane-hint";
import { laneKeyAtPoint } from "./gantt-lane-dom";
import { GanttSummaryShape } from "./gantt-summary-shape";
import type {
  GanttLaneDrag,
  GanttLaneTarget,
  GanttTaskEdit,
  ScheduledTask,
} from "./gantt-types";
import { lastScheduledInstant, scheduleDayBlocks } from "./schedule-geometry";
import { type GanttTimeline, getBarGridColumns } from "./timeline";

const CLICK_MOVE_THRESHOLD_PX = 4;
const MOBILE_MOVE_THRESHOLD_PX = 14;
// Browsers report a release as a move with no button held, at the spot the
// drag last reached, just before the pointerup itself (seen whenever the
// element under the pointer changed during the drag). Such a move is the
// release. One anywhere else means the release happened out of sight (a
// menu swallowed it), and the gesture is dropped rather than committed by
// the next unrelated click.
const RELEASE_SLOP_PX = 1;
const MIN_INLINE_LABEL_PX = 120;
// Narrower bars keep one truncated line, so words never break letter by letter.
const MIN_TWO_LINE_TITLE_PX = 96;
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
  // milestone). A milestone itself may only change its lead.
  laneDrag?: GanttLaneDrag;
  // A Task/Bug may be dragged sideways to move it on the schedule.
  canMoveDates?: boolean;
  onCommit: (edit: GanttTaskEdit) => void;
  onOpenTask: () => void;
  // Told when a move starts showing new dates, and when it ends.
  onDragChange?: (dragging: boolean) => void;
  // Read out with the bar, e.g. that it starts before a blocker ends.
  dependencyNote?: string;
  // Starts a task's bar with its assignee's avatar, for lanes that don't
  // say who does the work (grouped by milestone).
  showAssignee?: boolean;
  // Reads the status out with the bar, where no rail beside it names it.
  describeStatus?: boolean;
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
  canMoveDates: canMoveDatesProp = false,
  onCommit,
  onOpenTask,
  onDragChange,
  dependencyNote,
  showAssignee = false,
  describeStatus = false,
}: GanttTaskBarProps) {
  const { t } = useTranslation();
  const isMilestone = task.entityKind === "milestone";
  const isBug = !isMilestone && task.type === "bug";
  const canMoveDates = canMoveDatesProp && !isMilestone;
  const noteId = useId();
  const assigneeId = useId();
  const progressId = useId();
  const timingId = useId();
  const statusId = useId();
  const phase = (!isMilestone && task.statusPhase) || "active";
  const barStyle = GANTT_BAR_STYLES[isBug ? "bug" : "task"][phase];
  const exactTiming =
    !isMilestone && task.scheduleApplied
      ? (
          task.scheduleSegments ?? [
            { start: task.scheduleStart, end: task.scheduleEnd },
          ]
        )
          .map(
            (segment) =>
              `${segment.start.toLocaleString()} – ${segment.end.toLocaleString()}`,
          )
          .join("; ")
      : null;
  const [laneView, setLaneView] = useState<LaneView | null>(null);
  // Whole days a sideways drag has moved the bar so far.
  const [dragShift, setDragShift] = useState(0);
  // Whole days a resize has moved one end of the bar so far.
  const [resize, setResize] = useState<{
    edge: "start" | "end";
    days: number;
  } | null>(null);
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

  const startShift = dragShift + (resize?.edge === "start" ? resize.days : 0);
  const endShift = dragShift + (resize?.edge === "end" ? resize.days : 0);
  const displayStart = startShift
    ? addDays(task.scheduleStart, startShift)
    : task.scheduleStart;
  const displayEnd = endShift
    ? addDays(task.scheduleEnd, endShift)
    : task.scheduleEnd;
  const plannedWork = !isMilestone && task.scheduleApplied;
  // Touch drags pan the timeline, so phones get no handles.
  const resizable = canMoveDates && !isMobile;
  const segments = isMilestone ? undefined : task.scheduleSegments;
  const displaySegments =
    dragShift && segments
      ? segments.map((segment) => ({
          start: addDays(segment.start, dragShift),
          end: addDays(segment.end, dragShift),
        }))
      : segments;

  const trackCount = timeline.days.length;
  // Planned work ends at an exclusive instant; other bars end on a day.
  const { barInView, lineStart, lineEnd, clippedStart, clippedEnd } =
    getBarGridColumns(
      displayStart,
      plannedWork ? lastScheduledInstant(displayStart, displayEnd) : displayEnd,
      timeline.rangeStart,
      trackCount,
    );

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

  const laneHintLabel = (target: GanttLaneTarget) => {
    if (target.kind === "milestone") {
      if (!target.droppable)
        return t("tasks:gantt.milestones.cannotMove", { name: target.name });
      return target.milestoneId
        ? t("tasks:gantt.milestones.moveTo", { name: target.name })
        : t("tasks:gantt.milestones.remove");
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
    // Touch drags pan the timeline instead (the browser cancels the
    // gesture), so lanes are only targeted by mouse and pen.
    const lane =
      event.pointerType === "touch" ||
      (isMilestone && laneDrag?.kind !== "assignee")
        ? undefined
        : laneDrag;
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

    // Touch drags pan the timeline, so dates also move by mouse and pen only.
    const movesDates = canMoveDates && event.pointerType !== "touch";
    const shiftFor = (clientX: number) =>
      movesDates ? Math.round((clientX - originX) / pxPerDay) : 0;
    // Gestures that may move dates or lanes can be cancelled with Esc.
    const cancellable = Boolean(lane) || movesDates;

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
      const target = (latestRef.current.laneDrag ?? lane).resolveLane(key);
      if (target?.kind === "milestone") {
        return {
          ...target,
          droppable: canDropIntoMilestone(latestRef.current.task, target),
        };
      }
      return target;
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
      if (cancellable) {
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("blur", end);
      }
      if (lane) {
        scrollContainer?.removeEventListener("scroll", syncLane);
        if (reportedTarget !== undefined) lane.onChange(null);
      }
      endGestureRef.current = null;
      drag.end();
      setLaneView(null);
      setDragShift(0);
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerType === "mouse" && (ev.buttons & 1) === 0) {
        // See RELEASE_SLOP_PX.
        if (
          Math.hypot(ev.clientX - pointer.x, ev.clientY - pointer.y) <=
          RELEASE_SLOP_PX
        )
          release(pointer.x, pointer.y);
        else end();
        return;
      }
      pointer = { x: ev.clientX, y: ev.clientY };
      if (pointerTravel(ev.clientX, ev.clientY) >= moveThresholdPx) {
        dragging = true;
        drag.start();
      }
      if (dragging && movesDates) setDragShift(shiftFor(ev.clientX));
      syncLane();
    };

    const release = (clientX: number, clientY: number) => {
      const travelled = pointerTravel(clientX, clientY) >= moveThresholdPx;
      const isDrag = cancellable ? dragging || travelled : travelled;
      const dy = lane && isDrag ? verticalOffset(clientY) : 0;
      // Hit-test before end(): the dragged bar is still click-through, so it
      // can't hide the lane underneath the pointer.
      const target =
        Math.abs(dy) >= LANE_ENGAGE_PX ? laneTargetAt(clientX, clientY) : null;
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
      const shift = shiftFor(clientX);
      const dropLane = target?.droppable ? target : null;
      if (current.entityKind === "milestone" && dropLane?.kind !== "assignee")
        return;
      if (!dropLane && shift === 0) return;
      commit({
        start: addDays(initialStart, shift),
        end: addDays(initialEnd, shift),
        userId:
          dropLane?.kind === "assignee"
            ? dropLane.userId
            : current.userId || null,
        featureId: current.featureId ?? null,
        milestoneId:
          dropLane?.kind === "milestone"
            ? dropLane.milestoneId
            : (current.milestoneId ?? null),
      });
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.type === "pointercancel") end();
      else release(ev.clientX, ev.clientY);
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
    if (cancellable) {
      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("blur", end);
    }
    if (lane) {
      scrollContainer?.addEventListener("scroll", syncLane, { passive: true });
    }
    endGestureRef.current = end;
  };

  // An end never crosses the other one: the bar keeps at least a day.
  const clampResize = (edge: "start" | "end", days: number) => {
    const { task: current } = latestRef.current;
    const length = differenceInCalendarDays(
      current.scheduleEnd,
      current.scheduleStart,
    );
    return edge === "start" ? Math.min(days, length) : Math.max(days, -length);
  };
  const commitResize = (edge: "start" | "end", days: number) => {
    const { task: current, onCommit: commit } = latestRef.current;
    const shift = clampResize(edge, days);
    if (shift === 0) return;
    // Planned work keeps its time of day, so a bar shrunk to one day could
    // otherwise start a few hours after it ends; the moved end stops at the
    // other one.
    const start =
      edge === "start"
        ? new Date(
            Math.min(
              addDays(current.scheduleStart, shift).getTime(),
              current.scheduleEnd.getTime(),
            ),
          )
        : current.scheduleStart;
    const end =
      edge === "end"
        ? new Date(
            Math.max(
              addDays(current.scheduleEnd, shift).getTime(),
              current.scheduleStart.getTime(),
            ),
          )
        : current.scheduleEnd;
    commit({
      start,
      end,
      userId: current.userId || null,
      featureId: current.featureId ?? null,
      milestoneId: current.milestoneId ?? null,
      exact: true,
    });
  };

  const handleResizePointerDown =
    (edge: "start" | "end") => (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      endGestureRef.current?.();
      const originX = event.clientX;
      const drag = dragReporter();
      const daysFor = (clientX: number) =>
        clampResize(edge, Math.round((clientX - originX) / pxPerDay));

      const end = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", end);
        window.removeEventListener("contextmenu", end);
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("blur", end);
        endGestureRef.current = null;
        drag.end();
        setResize(null);
      };
      let lastX = originX;
      const finish = (clientX: number) => {
        const days = daysFor(clientX);
        end();
        commitResize(edge, days);
      };
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerType === "mouse" && (ev.buttons & 1) === 0) {
          // See RELEASE_SLOP_PX.
          if (Math.abs(ev.clientX - lastX) <= RELEASE_SLOP_PX) finish(lastX);
          else end();
          return;
        }
        lastX = ev.clientX;
        drag.start();
        setResize({ edge, days: daysFor(ev.clientX) });
      };
      const onUp = (ev: PointerEvent) => finish(ev.clientX);
      const onKeyDown = (ev: KeyboardEvent) => {
        if (ev.key !== "Escape") return;
        ev.preventDefault();
        ev.stopPropagation();
        end();
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", end);
      window.addEventListener("contextmenu", end);
      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("blur", end);
      endGestureRef.current = end;
    };

  if (!barInView || lineEnd <= lineStart) {
    return null;
  }

  // Planned work split by days without work (a weekend, time off) draws one
  // block per run of working days, each inset like a whole bar.
  const barDays = lineEnd - lineStart;
  const dayBlocks =
    plannedWork && displaySegments
      ? scheduleDayBlocks(displaySegments, timeline.rangeStart, trackCount)
      : [];
  const workBlocks = dayBlocks.length > 1 ? dayBlocks : null;

  // Short bars on phones leave no room for the title inside them, so it's
  // drawn just after the bar instead (when the timeline has room for it).
  const barWidthPx = barDays * pxPerDay;
  const labelOutside =
    isMobile && barWidthPx < MIN_INLINE_LABEL_PX && lineEnd <= trackCount;

  const counts = isMilestone ? task.subtaskCounts : undefined;
  const progress =
    counts && counts.total > 0
      ? {
          text: t("tasks:gantt.milestones.bar.progress", {
            completed: counts.completed,
            total: counts.total,
          }),
          aria: t("tasks:gantt.milestones.bar.progressAria", {
            completed: counts.completed,
            count: counts.total,
          }),
        }
      : null;
  const assigneeNote =
    showAssignee && !isMilestone
      ? task.userId
        ? t("tasks:gantt.featureLanes.assignee", {
            name: task.assigneeName?.trim() || t("common:people.unknown"),
          })
        : t("tasks:assignee.unassigned")
      : null;
  // A one-day bar on a desktop has no room for it beside the handles.
  const showAvatar = assigneeNote !== null && barWidthPx >= AVATAR_ROOM_PX;
  const statusNote =
    describeStatus && !isMilestone ? getStatusLabel(task.status) : null;
  const describedBy =
    // The dependency note goes first: it ends in a full stop, so a screen
    // reader pauses before the assignee or progress note that follows.
    [
      dependencyNote && noteId,
      assigneeNote && assigneeId,
      progress && progressId,
      statusNote && statusId,
      exactTiming && timingId,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  const ariaLabel = isMilestone
    ? laneDrag?.kind === "assignee"
      ? t("tasks:gantt.milestones.bar.ariaLabelGrouped", { title: task.title })
      : t("tasks:gantt.milestones.bar.ariaLabel", { title: task.title })
    : laneDrag?.kind === "milestone"
      ? canMoveDates
        ? t("tasks:gantt.milestones.taskAriaLabelMovable", {
            title: task.title,
          })
        : t("tasks:gantt.milestones.taskAriaLabel", { title: task.title })
      : laneDrag
        ? canMoveDates
          ? t("tasks:gantt.taskAriaLabelGroupedMovable", { title: task.title })
          : t("tasks:gantt.taskAriaLabelGrouped", { title: task.title })
        : canMoveDates
          ? t("tasks:gantt.taskAriaLabelMovable", { title: task.title })
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
        data-gantt-bar={isMilestone ? "milestone" : "task"}
        data-gantt-phase={isMilestone ? undefined : phase}
        style={{ gridColumn: `${lineStart} / ${lineEnd}`, gridRow: 1 }}
        className={cn(
          "relative flex min-w-0 items-stretch text-left",
          // A milestone keeps a task bar's hit area but only draws the thinner
          // summary band inside it; the band carries the hover, focus and
          // lifted styles instead.
          isMilestone
            ? "group/bar mx-1 min-h-[44px] sm:h-11 sm:min-h-0"
            : cn(
                // Fills its row, leaving dependency arrows room to turn.
                "group my-1 min-h-11 self-stretch overflow-hidden rounded-md text-sm font-medium leading-none text-foreground transition-colors",
                workBlocks
                  ? "mx-0"
                  : cn("mx-1 border bg-background shadow-sm", barStyle.border),
              ),
          !isMilestone && barStyle.bar,
          !isMilestone && laneView && cn("shadow-lg ring-2", barStyle.ring),
          laneView ? "pointer-events-none" : "pointer-events-auto",
        )}
      >
        {isMilestone && (
          // Centred in the row, so dependency arrows still meet its ends.
          <GanttSummaryShape
            clippedStart={clippedStart}
            clippedEnd={clippedEnd}
            className={cn(
              "inset-x-0 top-1/2 h-6 -translate-y-1/2 shadow-sm group-hover/bar:bg-milestone/85",
              "group-has-[:focus-visible]/bar:ring-2 group-has-[:focus-visible]/bar:ring-ring group-has-[:focus-visible]/bar:ring-offset-2 group-has-[:focus-visible]/bar:ring-offset-background",
              laneView &&
                "shadow-lg ring-2 ring-milestone/40 ring-offset-2 ring-offset-background",
            )}
          />
        )}
        {workBlocks?.map((block) => (
          <span
            key={block.from}
            data-gantt-work-segment=""
            className={cn(
              "pointer-events-none absolute inset-y-0 rounded-md border bg-background shadow-sm",
              barStyle.border,
            )}
            style={{
              left: `calc(${((block.from - (lineStart - 1)) / barDays) * 100}% + 4px)`,
              width: `calc(${((block.to - block.from) / barDays) * 100}% - 8px)`,
            }}
          >
            <span
              className={cn(
                "absolute inset-0 rounded-[inherit] transition-colors",
                barStyle.fill,
              )}
            />
          </span>
        ))}
        {/* A clipped end isn't the real date, so it can't be dragged. */}
        {resizable && !clippedStart && !laneView && (
          <GanttResizeHandle
            edge="start"
            label={t("tasks:gantt.resizeStart")}
            className={barStyle.handle}
            onPointerDown={handleResizePointerDown("start")}
            onNudge={(days) => commitResize("start", days)}
          />
        )}
        {resizable && !clippedEnd && !laneView && (
          <GanttResizeHandle
            edge="end"
            label={t("tasks:gantt.resizeDue")}
            className={barStyle.handle}
            onPointerDown={handleResizePointerDown("end")}
            onNudge={(days) => commitResize("end", days)}
          />
        )}
        <button
          type="button"
          aria-label={
            task.type === "bug"
              ? `${t("tasks:features.typeBug")}: ${ariaLabel}`
              : ariaLabel
          }
          aria-describedby={describedBy}
          title={exactTiming ?? undefined}
          className={cn(
            "relative z-10 min-h-[44px] min-w-0 flex-1 touch-manipulation overflow-hidden px-2 text-left sm:min-h-0 sm:px-2.5",
            laneDrag || canMoveDates
              ? "cursor-grab active:cursor-grabbing"
              : "cursor-pointer",
            isMilestone && "flex items-center focus-visible:outline-hidden",
          )}
          onPointerDown={handleMovePointerDown}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenTask();
            }
          }}
        >
          {isMilestone ? (
            <GanttMilestoneBarLabel
              title={task.title}
              progress={progress?.text ?? null}
              textOutside={labelOutside}
            />
          ) : (
            <>
              <div
                className={cn(
                  "absolute inset-0 z-0 transition-colors",
                  workBlocks && "hidden",
                  barStyle.fill,
                )}
              />
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
                    // The bar is tall enough for two lines of title.
                    "min-w-0 leading-tight",
                    barWidthPx >= MIN_TWO_LINE_TITLE_PX
                      ? "line-clamp-2 break-words"
                      : "block truncate",
                    labelOutside && "sr-only",
                  )}
                >
                  {phase === "done" && (
                    <Check
                      aria-hidden="true"
                      data-gantt-bar-done=""
                      className="mr-1 inline-block size-3.5 shrink-0 align-text-bottom"
                    />
                  )}
                  {task.type === "bug" && (
                    <TaskTypeGlyph
                      type="bug"
                      className="mr-1 inline-block size-3.5 shrink-0 align-text-bottom text-destructive-foreground"
                    />
                  )}
                  {task.title}
                </span>
              </span>
            </>
          )}
        </button>
        {/* Hidden, not sr-only: read as the button's description, never a
            second time as loose text after it. */}
        {exactTiming && (
          <span id={timingId} hidden>
            {exactTiming}
          </span>
        )}
        {statusNote && (
          <span id={statusId} hidden>
            {statusNote}
          </span>
        )}
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
      </div>
      {labelOutside && (
        <span
          aria-hidden="true"
          style={{ gridColumn: `${lineEnd} / ${trackCount + 1}`, gridRow: 1 }}
          className={cn(
            "min-w-0 truncate pl-1 text-xs text-foreground/80",
            isMilestone ? "font-semibold" : "font-medium",
          )}
        >
          {task.type === "bug" && (
            <TaskTypeGlyph
              type="bug"
              className="mr-1 inline-block size-3.5 shrink-0 align-text-bottom text-destructive-foreground"
            />
          )}
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
