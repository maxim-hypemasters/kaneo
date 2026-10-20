import { AssigneeAvatar } from "@/components/task/properties/assignee-avatar";
import { cn } from "@/lib/cn";
import { GanttLaneSummaryLine } from "./gantt-lane-summary-line";
import { GanttLaneToggle } from "./gantt-lane-toggle";
import { GanttAssigneeMilestones } from "./gantt-assignee-milestones";
import { assigneeMilestoneTracks } from "./assignee-milestone-tracks";
import type {
  GanttLane,
  GanttLaneDrag,
  GanttTaskEdit,
  ScheduledMilestone,
} from "./gantt-types";
import type { GanttTimeline } from "./timeline";

type GanttLaneHeaderProps = {
  lane: GanttLane;
  labelId: string;
  collapsed: boolean;
  onToggle: () => void;
  timeline: GanttTimeline;
  showTaskRail: boolean;
  rowGridTemplateColumns: string;
  pixelsPerDay: number;
  isMobile: boolean;
  laneDrag?: GanttLaneDrag;
  onOpenMilestone: (milestoneId: string) => void;
  onCommitMilestone: (
    milestone: ScheduledMilestone,
    edit: GanttTaskEdit,
  ) => void;
};

export function GanttLaneHeader({
  lane,
  labelId,
  collapsed,
  onToggle,
  timeline,
  showTaskRail,
  rowGridTemplateColumns,
  pixelsPerDay,
  isMobile,
  laneDrag,
  onOpenMilestone,
  onCommitMilestone,
}: GanttLaneHeaderProps) {
  const taskCount = lane.tasks.filter(
    (task) => task.entityKind !== "milestone",
  ).length;
  const hasTasks = taskCount > 0;
  const tracks = assigneeMilestoneTracks(lane.tasks, timeline, isMobile);
  const hasMilestones = tracks.length > 0;
  // Lanes with tasks get a full touch target for the collapse toggle; empty
  // lanes render compact. Milestone tracks grow the header past either.
  const heightClassName = hasTasks
    ? "min-h-[44px] sm:min-h-9"
    : "min-h-9 sm:min-h-8";
  const control = (
    <GanttLaneToggle
      labelId={labelId}
      name={lane.name}
      count={taskCount}
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
      data-gantt-lane-header=""
      className="grid items-stretch border-b border-border/70"
      style={{ gridTemplateColumns: rowGridTemplateColumns }}
    >
      {showTaskRail ? (
        <div
          data-gantt-rail=""
          className={cn(
            "sticky left-0 z-[11] flex h-full border-r border-border bg-background px-2 sm:px-3",
            hasMilestones ? "items-start" : "items-center",
            heightClassName,
          )}
        >
          {/* The muted token is translucent; tint an opaque base so the
              timeline scrolling underneath the sticky rail stays hidden. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-muted"
          />
          {hasMilestones ? (
            <div className="flex h-11 w-full items-center">{control}</div>
          ) : (
            control
          )}
        </div>
      ) : null}

      <div
        className={cn(
          "relative flex shrink-0 cursor-grab flex-col bg-muted/40",
          !hasMilestones && "justify-center",
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
            )}
          >
            {control}
          </div>
        )}
        {hasMilestones && (
          <GanttAssigneeMilestones
            tracks={tracks}
            timeline={timeline}
            pixelsPerDay={pixelsPerDay}
            isMobile={isMobile}
            laneDrag={laneDrag}
            onOpen={onOpenMilestone}
            onCommit={onCommitMilestone}
          />
        )}
      </div>
    </div>
  );
}
