import { GanttTaskBar } from "./gantt-task-bar";
import { useHeldCompactTracks } from "./use-held-compact-tracks";
import type {
  GanttLaneDrag,
  GanttTaskEdit,
  ScheduledTask,
} from "./gantt-types";
import type { GanttTimeline } from "./timeline";

// As tall as a bar plus room for dependency arrows to turn between rows.
const TRACK_REM = 3.25;

type GanttCompactRowsProps = {
  // Packed into tracks of tasks whose bars cover no common day; see
  // compactTaskTracks.
  tasks: readonly ScheduledTask[];
  // Whether everything that places the bars has loaded, so the tracks can
  // hold still from here on.
  ready: boolean;
  timeline: GanttTimeline;
  pixelsPerDay: number;
  isMobile: boolean;
  // Lanes keep the rail for their name; rows leave their part of it empty.
  showTaskRail: boolean;
  rowGridTemplateColumns: string;
  showBarAssignee: boolean;
  laneDrag?: GanttLaneDrag;
  // Whether this task's dates may be moved; tasks and bugs have separate
  // permissions.
  canMoveDates?: (task: ScheduledTask) => boolean;
  onOpenTask: (task: ScheduledTask) => void;
  onCommit: (task: ScheduledTask, edit: GanttTaskEdit) => void;
  onDragChange: (taskId: string) => (dragging: boolean) => void;
  dependencyNote: (taskId: string) => string | undefined;
};

// A lane's compact rows. Every bar is a direct child keyed by its task and
// placed on its track by offset: when a bar changes track (a saved edit that
// no longer fits its own) it only moves, it is never remounted, so a drag in
// progress on it survives.
export function GanttCompactRows({
  tasks,
  ready,
  timeline,
  pixelsPerDay,
  isMobile,
  showTaskRail,
  rowGridTemplateColumns,
  showBarAssignee,
  laneDrag,
  canMoveDates,
  onOpenTask,
  onCommit,
  onDragChange,
  dependencyNote,
}: GanttCompactRowsProps) {
  const tracks = useHeldCompactTracks(tasks, isMobile, ready);
  if (tracks.length === 0) return null;
  return (
    // No lines between rows: compact lanes are divided only from each other.
    <div
      data-gantt-compact-rows=""
      className="grid items-stretch"
      style={{ gridTemplateColumns: rowGridTemplateColumns }}
    >
      {showTaskRail ? (
        <div
          data-gantt-rail=""
          className="sticky left-0 z-[11] h-full border-r border-border bg-background"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-muted"
          />
        </div>
      ) : null}
      <div
        className="relative shrink-0 cursor-grab select-none"
        style={{
          minWidth: `${timeline.timelineMinWidthRem}rem`,
          height: `${tracks.length * TRACK_REM}rem`,
        }}
      >
        {tracks.flatMap((trackTasks, track) =>
          trackTasks.map((task) => (
            // One per task: dependency arrows find a bar's row by this
            // attribute.
            <div
              key={task.id}
              data-gantt-row={task.id}
              data-gantt-track={track}
              className="pointer-events-none absolute inset-x-0"
              style={{
                top: `${track * TRACK_REM}rem`,
                height: `${TRACK_REM}rem`,
              }}
            >
              <GanttTaskBar
                task={task}
                timeline={timeline}
                pixelsPerDay={pixelsPerDay}
                isMobile={isMobile}
                laneDrag={laneDrag}
                canMoveDates={canMoveDates?.(task)}
                onCommit={(edit) => onCommit(task, edit)}
                onOpenTask={() => onOpenTask(task)}
                onDragChange={onDragChange(task.id)}
                dependencyNote={dependencyNote(task.id)}
                showAssignee={showBarAssignee}
                describeStatus
              />
            </div>
          )),
        )}
      </div>
    </div>
  );
}
