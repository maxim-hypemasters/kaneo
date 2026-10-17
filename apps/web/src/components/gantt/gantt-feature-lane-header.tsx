import { ArrowUpRight, Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { GanttLaneSummaryLine } from "./gantt-lane-summary-line";
import { GanttLaneToggle } from "./gantt-lane-toggle";
import { GanttTaskBar } from "./gantt-task-bar";
import type { GanttFeatureLane, GanttTaskEdit } from "./gantt-types";
import type { GanttTimeline } from "./timeline";

type GanttFeatureLaneHeaderProps = {
  lane: GanttFeatureLane;
  labelId: string;
  collapsed: boolean;
  onToggle: () => void;
  timeline: GanttTimeline;
  pixelsPerDay: number;
  isMobile: boolean;
  showTaskRail: boolean;
  rowGridTemplateColumns: string;
  onOpenFeature: (featureId: string) => void;
  // Saves a move or resize of the feature's own bar.
  onCommitFeature: (edit: GanttTaskEdit) => void;
  onFeatureDragChange?: (dragging: boolean) => void;
  featureDependencyNote?: string;
};

// The header of a lane grouped by feature: its name and task count in the
// rail, and on the timeline the feature's own bar (its own dates: moving or
// resizing it reschedules the feature, never its tasks) over a thin line
// spanning its tasks, so the two can be compared at a glance.
export function GanttFeatureLaneHeader({
  lane,
  labelId,
  collapsed,
  onToggle,
  timeline,
  pixelsPerDay,
  isMobile,
  showTaskRail,
  rowGridTemplateColumns,
  onOpenFeature,
  onCommitFeature,
  onFeatureDragChange,
  featureDependencyNote,
}: GanttFeatureLaneHeaderProps) {
  const { t } = useTranslation();
  const { featureId, feature } = lane;
  // A feature that isn't on the board can't be opened either.
  const openable = featureId !== null && lane.droppable;
  const openLabel = t("tasks:gantt.featureLanes.open", { title: lane.name });

  const controls = (
    <>
      <GanttLaneToggle
        labelId={labelId}
        name={lane.name}
        count={lane.tasks.length}
        icon={
          featureId === null ? undefined : (
            <Layers
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          )
        }
        collapsed={collapsed}
        onToggle={onToggle}
        inRail={showTaskRail}
        className={showTaskRail ? "w-auto flex-1" : undefined}
      />
      {openable && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={openLabel}
                onClick={() => onOpenFeature(featureId)}
                className="touch-hitbox relative flex size-6 shrink-0 touch-manipulation items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              />
            }
          >
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{openLabel}</TooltipContent>
        </Tooltip>
      )}
    </>
  );

  return (
    <div
      className="grid items-stretch border-b border-border/70"
      style={{ gridTemplateColumns: rowGridTemplateColumns }}
    >
      {showTaskRail ? (
        <div
          data-gantt-rail=""
          className="sticky left-0 z-[11] flex h-full min-h-11 items-center gap-1 border-r border-border bg-background px-2 sm:px-3"
        >
          {/* The muted token is translucent; tint an opaque base so the
              timeline scrolling underneath the sticky rail stays hidden. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-muted"
          />
          {controls}
        </div>
      ) : null}

      {/* The bottom padding gives the task-span underline its own room
          below the bar's box, clear of the bracket tips. */}
      <div
        className="relative flex min-h-11 shrink-0 cursor-grab select-none flex-col justify-center bg-muted/40 pb-2"
        style={{ minWidth: `${timeline.timelineMinWidthRem}rem` }}
      >
        <GanttLaneSummaryLine
          start={lane.start}
          end={lane.end}
          timeline={timeline}
        />
        {showTaskRail ? null : (
          <div className="sticky left-0 z-[2] mt-1 flex items-center gap-1 self-start rounded-sm bg-background px-2 py-1">
            {controls}
          </div>
        )}
        {feature && (
          // Arrows meet a row's vertical centre, so the row is the bar's own
          // box, below the name chip when there's no rail.
          <div
            data-gantt-row={feature.id}
            className={cn("relative", showTaskRail ? "min-h-11" : "min-h-12")}
          >
            <GanttTaskBar
              task={feature}
              timeline={timeline}
              pixelsPerDay={pixelsPerDay}
              isMobile={isMobile}
              onCommit={onCommitFeature}
              onOpenTask={() => onOpenFeature(feature.id)}
              onDragChange={onFeatureDragChange}
              dependencyNote={featureDependencyNote}
            />
          </div>
        )}
      </div>
    </div>
  );
}
