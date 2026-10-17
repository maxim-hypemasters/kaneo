import { AssigneeAvatar } from "@/components/task/properties/assignee-avatar";
import { cn } from "@/lib/cn";
import { GanttLaneFeatures } from "./gantt-lane-features";
import { GanttLaneSummaryLine } from "./gantt-lane-summary-line";
import { GanttLaneToggle } from "./gantt-lane-toggle";
import type { GanttLane } from "./gantt-types";
import type { GanttTimeline } from "./timeline";

type GanttLaneHeaderProps = {
  lane: GanttLane;
  labelId: string;
  collapsed: boolean;
  onToggle: () => void;
  timeline: GanttTimeline;
  showTaskRail: boolean;
  // Width of the sticky task rail (0 when it's hidden).
  railWidthRem: number;
  rowGridTemplateColumns: string;
  onOpenFeature: (featureId: string) => void;
};

export function GanttLaneHeader({
  lane,
  labelId,
  collapsed,
  onToggle,
  timeline,
  showTaskRail,
  railWidthRem,
  rowGridTemplateColumns,
  onOpenFeature,
}: GanttLaneHeaderProps) {
  const hasTasks = lane.tasks.length > 0;
  const hasFeatures = lane.featureTrackCount > 0;
  // Lanes with tasks get a full touch target for the collapse toggle; empty
  // lanes render compact. Feature tracks grow the header past either.
  const heightClassName = hasTasks
    ? "min-h-[44px] sm:min-h-9"
    : "min-h-9 sm:min-h-8";
  const control = (
    <GanttLaneToggle
      labelId={labelId}
      name={lane.name}
      count={lane.tasks.length}
      icon={
        <span aria-hidden="true" className="shrink-0">
          <AssigneeAvatar
            name={lane.name}
            image={lane.image}
            assigned={lane.userId !== null}
            className="size-5"
            fallbackClassName="text-[9px]"
          />
        </span>
      }
      collapsed={collapsed}
      onToggle={onToggle}
      inRail={showTaskRail}
    />
  );

  return (
    <div
      className="grid items-stretch border-b border-border/70"
      style={{ gridTemplateColumns: rowGridTemplateColumns }}
    >
      {showTaskRail ? (
        <div
          data-gantt-rail=""
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
          "relative flex shrink-0 cursor-grab flex-col justify-center bg-muted/40",
          heightClassName,
        )}
        style={{ minWidth: `${timeline.timelineMinWidthRem}rem` }}
      >
        <GanttLaneSummaryLine
          start={lane.start}
          end={lane.end}
          timeline={timeline}
        />
        {showTaskRail ? null : (
          <div
            className={cn(
              "sticky left-0 z-[2] self-start rounded-sm bg-background px-2 py-1",
              hasFeatures && "mt-1",
            )}
          >
            {control}
          </div>
        )}
        {/* Without the rail the tracks stack below the sticky name chip;
            the bottom padding leaves the workload underline its own room. */}
        <GanttLaneFeatures
          features={lane.features}
          overflowFeatures={lane.overflowFeatures}
          trackCount={lane.featureTrackCount}
          timeline={timeline}
          railWidthRem={railWidthRem}
          onOpenFeature={onOpenFeature}
          className="pt-1 pb-2.5"
        />
      </div>
    </div>
  );
}
