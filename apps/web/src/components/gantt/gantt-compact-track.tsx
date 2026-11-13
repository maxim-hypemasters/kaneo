import { GanttTaskBar } from "./gantt-task-bar";
import type {
  GanttLaneDrag,
  GanttTaskEdit,
  ScheduledTask,
} from "./gantt-types";
import type { GanttTimeline } from "./timeline";

type GanttCompactTrackProps = {
  // Tasks whose bars cover no common day; see compactTaskTracks.
  tasks: readonly ScheduledTask[];
  timeline: GanttTimeline;
  pixelsPerDay: number;
  isMobile: boolean;
  showBarAssignee: boolean;
  laneDrag?: GanttLaneDrag;
  canMoveDates?: boolean;
  onOpenTask: (task: ScheduledTask) => void;
  onCommit: (task: ScheduledTask, edit: GanttTaskEdit) => void;
  onDragChange: (taskId: string) => (dragging: boolean) => void;
  dependencyNote: (taskId: string) => string | undefined;
};

export function GanttCompactTrack({
  tasks,
  timeline,
  pixelsPerDay,
  isMobile,
  showBarAssignee,
  laneDrag,
  canMoveDates,
  onOpenTask,
  onCommit,
  onDragChange,
  dependencyNote,
}: GanttCompactTrackProps) {
  return (
    <div
      data-gantt-compact-track=""
      // Taller than a bar, so dependency arrows have room to turn between
      // rows.
      className="relative min-h-13 shrink-0 cursor-grab border-b border-border/70 select-none"
      style={{ minWidth: `${timeline.timelineMinWidthRem}rem` }}
    >
      {tasks.map((task) => (
        // One per task: dependency arrows find a bar's row by this attribute.
        <div
          key={task.id}
          data-gantt-row={task.id}
          className="pointer-events-none absolute inset-0"
        >
          <GanttTaskBar
            task={task}
            timeline={timeline}
            pixelsPerDay={pixelsPerDay}
            isMobile={isMobile}
            laneDrag={laneDrag}
            canMoveDates={canMoveDates}
            onCommit={(edit) => onCommit(task, edit)}
            onOpenTask={() => onOpenTask(task)}
            onDragChange={onDragChange(task.id)}
            dependencyNote={dependencyNote(task.id)}
            showAssignee={showBarAssignee}
          />
        </div>
      ))}
    </div>
  );
}
