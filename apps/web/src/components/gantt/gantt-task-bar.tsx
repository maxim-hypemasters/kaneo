import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AssigneeAvatar } from "@/components/task/properties/assignee-avatar";
import { cn } from "@/lib/cn";
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
import { scheduleSegmentGeometry } from "./schedule-geometry";
import { type GanttTimeline, getBarGridColumns } from "./timeline";

const CLICK_MOVE_THRESHOLD_PX = 4;
const MOBILE_MOVE_THRESHOLD_PX = 14;
const MIN_INLINE_LABEL_PX = 120;
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
  onCommit: (edit: GanttTaskEdit) => void;
  onOpenTask: () => void;
  // Told when a move or resize starts showing new dates, and when it ends.
  onDragChange?: (dragging: boolean) => void;
  // Read out with the bar, e.g. that it starts before a blocker ends.
  dependencyNote?: string;
  // Starts a task's bar with its assignee's avatar, for lanes that don't
  // say who does the work (grouped by milestone).
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
  const isMilestone = task.entityKind === "milestone";
  const isBug = !isMilestone && task.type === "bug";
  const noteId = useId();
  const assigneeId = useId();
  const progressId = useId();
  const timingId = useId();
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

  const displayStart = task.scheduleStart;
  const displayEnd = task.scheduleEnd;

  const trackCount = timeline.days.length;
  const { barInView, lineStart, lineEnd, clippedStart, clippedEnd } =
    getBarGridColumns(
      displayStart,
      displayEnd,
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

    const datesFor = () => {
      const current = latestRef.current.task;
      return { start: current.scheduleStart, end: current.scheduleEnd };
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
      if (lane) {
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("blur", end);
        scrollContainer?.removeEventListener("scroll", syncLane);
        if (reportedTarget !== undefined) lane.onChange(null);
      }
      endGestureRef.current = null;
      drag.end();
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
      const { start, end: due } = datesFor();
      const dropLane = target?.droppable ? target : null;
      if (
        !dropLane ||
        (current.entityKind === "milestone" && dropLane.kind !== "assignee")
      )
        return;
      commit({
        start,
        end: due,
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
  const segmentEnvelope =
    !isMilestone && task.scheduleApplied
      ? scheduleSegmentGeometry(
          displayStart,
          displayEnd,
          timeline.rangeStart,
          trackCount,
        )
      : null;
  const workSegments =
    !isMilestone && task.scheduleSegments
      ? task.scheduleSegments.flatMap((segment) => {
          const geometry = scheduleSegmentGeometry(
            segment.start,
            segment.end,
            timeline.rangeStart,
            trackCount,
          );
          return geometry
            ? [{ ...geometry, start: segment.start, end: segment.end }]
            : [];
        })
      : null;

  const barWidthPx = (segmentEnvelope?.width ?? lineEnd - lineStart) * pxPerDay;
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
  const describedBy =
    // The dependency note goes first: it ends in a full stop, so a screen
    // reader pauses before the assignee or progress note that follows.
    [
      dependencyNote && noteId,
      assigneeNote && assigneeId,
      progress && progressId,
      exactTiming && timingId,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  const ariaLabel = isMilestone
    ? laneDrag?.kind === "assignee"
      ? t("tasks:gantt.milestones.bar.ariaLabelGrouped", { title: task.title })
      : t("tasks:gantt.milestones.bar.ariaLabel", { title: task.title })
    : laneDrag?.kind === "milestone"
      ? t("tasks:gantt.milestones.taskAriaLabel", { title: task.title })
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
        data-gantt-bar={isMilestone ? "milestone" : "task"}
        style={
          segmentEnvelope
            ? {
                gridColumn: `1 / ${trackCount + 1}`,
                gridRow: 1,
                marginLeft: `${(segmentEnvelope.left / trackCount) * 100}%`,
                width: `${(segmentEnvelope.width / trackCount) * 100}%`,
                marginRight: 0,
              }
            : { gridColumn: `${lineStart} / ${lineEnd}`, gridRow: 1 }
        }
        className={cn(
          "relative mx-1 flex min-h-[44px] min-w-0 items-stretch text-left sm:h-11 sm:min-h-0",
          // A milestone keeps a task bar's hit area but only draws the thinner
          // summary band inside it; the band carries the hover, focus and
          // lifted styles instead.
          isMilestone
            ? "group/bar"
            : cn(
                "group overflow-hidden rounded-md text-sm font-medium leading-none text-foreground transition-colors",
                !workSegments && "border bg-background shadow-sm",
                isBug
                  ? "border-destructive/35 hover:border-destructive/55"
                  : "border-primary/25 hover:border-primary/40",
              ),
          !isMilestone &&
            laneView &&
            cn(
              "shadow-lg ring-2",
              isBug ? "ring-destructive/40" : "ring-primary/40",
            ),
          laneView ? "pointer-events-none" : "pointer-events-auto",
        )}
      >
        {isMilestone && (
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
        {workSegments &&
          segmentEnvelope &&
          workSegments.map((segment) => (
            <span
              key={`${segment.start.toISOString()}:${segment.end.toISOString()}`}
              data-gantt-work-segment=""
              title={`${segment.start.toLocaleString()} – ${segment.end.toLocaleString()}`}
              className={cn(
                "pointer-events-none absolute inset-y-0 rounded-md border shadow-sm",
                isBug
                  ? "border-destructive/35 bg-destructive/12 group-hover:bg-destructive/18"
                  : "border-primary/25 bg-primary/12 group-hover:bg-primary/18",
              )}
              style={{
                left: `${((segment.left - segmentEnvelope.left) / segmentEnvelope.width) * 100}%`,
                width: `${(segment.width / segmentEnvelope.width) * 100}%`,
              }}
            />
          ))}
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
            laneDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
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
                  workSegments && "hidden",
                  isBug
                    ? "bg-destructive/12 group-hover:bg-destructive/18"
                    : "bg-primary/12 group-hover:bg-primary/18",
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
                    "block min-w-0 truncate",
                    labelOutside && "sr-only",
                  )}
                >
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
          style={
            segmentEnvelope
              ? {
                  gridColumn: `1 / ${trackCount + 1}`,
                  gridRow: 1,
                  marginLeft: `${((segmentEnvelope.left + segmentEnvelope.width) / trackCount) * 100}%`,
                }
              : { gridColumn: `${lineEnd} / ${trackCount + 1}`, gridRow: 1 }
          }
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
