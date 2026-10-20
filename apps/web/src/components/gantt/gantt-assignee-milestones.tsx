import { GanttTaskBar } from "./gantt-task-bar";
import type {
  GanttLaneDrag,
  GanttTaskEdit,
  ScheduledMilestone,
} from "./gantt-types";
import type { GanttTimeline } from "./timeline";

type GanttAssigneeMilestonesProps = {
  tracks: readonly (readonly ScheduledMilestone[])[];
  timeline: GanttTimeline;
  pixelsPerDay: number;
  isMobile: boolean;
  laneDrag?: GanttLaneDrag;
  onOpen: (milestoneId: string) => void;
  onCommit: (milestone: ScheduledMilestone, edit: GanttTaskEdit) => void;
};

export function GanttAssigneeMilestones({
  tracks,
  timeline,
  pixelsPerDay,
  isMobile,
  laneDrag,
  onOpen,
  onCommit,
}: GanttAssigneeMilestonesProps) {
  return (
    <div className="pb-2">
      {tracks.map((milestones) => (
        <div
          key={milestones[0]!.id}
          data-gantt-milestone-track=""
          className="relative h-11"
        >
          {milestones.map((milestone) => (
            <div
              key={milestone.id}
              data-gantt-row={milestone.id}
              className="pointer-events-none absolute inset-0"
            >
              <GanttTaskBar
                task={milestone}
                timeline={timeline}
                pixelsPerDay={pixelsPerDay}
                isMobile={isMobile}
                laneDrag={laneDrag}
                onOpenTask={() => onOpen(milestone.milestone.id)}
                onCommit={(edit) => onCommit(milestone, edit)}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
