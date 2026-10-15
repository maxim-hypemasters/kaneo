import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AssigneeAvatar } from "@/components/task/properties/assignee-avatar";
import { cn } from "@/lib/cn";
import type { GanttLane } from "./gantt-types";
import { type GanttTimeline, getBarGridColumns } from "./timeline";

type GanttLaneHeaderProps = {
  lane: GanttLane;
  labelId: string;
  collapsed: boolean;
  onToggle: () => void;
  timeline: GanttTimeline;
  showTaskRail: boolean;
  rowGridTemplateColumns: string;
};

export function GanttLaneHeader({
  lane,
  labelId,
  collapsed,
  onToggle,
  timeline,
  showTaskRail,
  rowGridTemplateColumns,
}: GanttLaneHeaderProps) {
  const { t } = useTranslation();
  const count = lane.tasks.length;
  const countId = `${labelId}-count`;
  const hasTasks = count > 0;
  // The member's whole workload at a glance: earliest start to latest end,
  // clipped to the visible window like a task bar.
  const summary =
    lane.start && lane.end
      ? getBarGridColumns(
          lane.start,
          lane.end,
          timeline.rangeStart,
          timeline.days.length,
        )
      : null;

  const label = (
    <>
      {hasTasks && (
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform duration-150 ease-out motion-reduce:transition-none",
            !collapsed && "rotate-90",
          )}
        />
      )}
      <span aria-hidden="true" className="shrink-0">
        <AssigneeAvatar
          name={lane.name}
          image={lane.image}
          assigned={lane.userId !== null}
          className="size-5"
          fallbackClassName="text-[9px]"
        />
      </span>
      <span id={labelId} className="min-w-0 truncate">
        {lane.name}
      </span>
      <span
        aria-hidden="true"
        className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
      >
        {count}
      </span>
      <span id={countId} className="sr-only">
        {t("tasks:gantt.laneTaskCount", { count })}
      </span>
    </>
  );

  // Lanes with tasks get a full touch target for the collapse toggle; empty
  // lanes render compact.
  const heightClassName = hasTasks
    ? "min-h-[44px] sm:min-h-9"
    : "min-h-9 sm:min-h-8";
  const labelClassName =
    "flex min-w-0 items-center gap-2 text-left text-xs font-medium text-foreground";
  // Empty lanes have nothing to collapse; they're still drop targets.
  const control = hasTasks ? (
    <button
      type="button"
      aria-expanded={!collapsed}
      aria-labelledby={`${labelId} ${countId}`}
      onClick={onToggle}
      className={cn(
        labelClassName,
        "touch-hitbox relative touch-manipulation rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // In the rail the whole header height toggles, not just the label.
        showTaskRail ? "w-full self-stretch" : "max-w-[12rem]",
      )}
    >
      {label}
    </button>
  ) : (
    <div
      className={cn(
        labelClassName,
        "relative",
        showTaskRail ? "w-full" : "max-w-[12rem]",
      )}
    >
      {label}
    </div>
  );

  return (
    <div
      className="grid items-stretch border-b border-border/70"
      style={{ gridTemplateColumns: rowGridTemplateColumns }}
    >
      {showTaskRail ? (
        <div
          className={cn(
            "sticky left-0 z-[11] flex h-full items-center border-r border-border bg-background px-2 sm:px-3",
            heightClassName,
          )}
        >
          {/* The muted token is translucent; tint an opaque base so the
              timeline scrolling underneath the sticky rail stays hidden. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-muted"
          />
          {control}
        </div>
      ) : null}

      <div
        className={cn(
          "relative flex shrink-0 items-center bg-muted/40",
          heightClassName,
        )}
        style={{ minWidth: `${timeline.timelineMinWidthRem}rem` }}
      >
        {summary?.barInView && (
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 grid",
              showTaskRail ? "items-center" : "items-end pb-1",
            )}
            style={{ gridTemplateColumns: timeline.gridTemplateColumns }}
          >
            <div
              data-testid="gantt-lane-summary"
              style={{
                gridColumn: `${summary.lineStart} / ${summary.lineEnd}`,
              }}
              className={cn(
                "h-1.5 bg-primary/45",
                summary.clippedStart ? "rounded-l-none" : "ml-1 rounded-l-full",
                summary.clippedEnd ? "rounded-r-none" : "mr-1 rounded-r-full",
              )}
            />
          </div>
        )}
        {showTaskRail ? null : (
          <div className="sticky left-0 z-[2] rounded-sm bg-background px-2 py-1">
            {control}
          </div>
        )}
      </div>
    </div>
  );
}
