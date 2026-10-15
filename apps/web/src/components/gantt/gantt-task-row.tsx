import { format } from "date-fns";
import { getStatusLabel } from "@/lib/i18n/domain";
import { GanttTaskBar } from "./gantt-task-bar";
import type {
  GanttLaneDrag,
  GanttTaskEdit,
  ScheduledTask,
} from "./gantt-types";
import type { GanttTimeline } from "./timeline";

type GanttTaskRowProps = {
  task: ScheduledTask;
  projectSlug: string | undefined;
  timeline: GanttTimeline;
  pixelsPerDay: number;
  isMobile: boolean;
  showTaskRail: boolean;
  rowGridTemplateColumns: string;
  // Lanes already name the assignee, so grouped rows leave it out.
  showAssignee: boolean;
  laneDrag?: GanttLaneDrag;
  onOpenTask: () => void;
  onCommit: (edit: GanttTaskEdit) => void;
};

export function GanttTaskRow({
  task,
  projectSlug,
  timeline,
  pixelsPerDay,
  isMobile,
  showTaskRail,
  rowGridTemplateColumns,
  showAssignee,
  laneDrag,
  onOpenTask,
  onCommit,
}: GanttTaskRowProps) {
  return (
    <div
      className="grid items-stretch border-b border-border/70"
      style={{ gridTemplateColumns: rowGridTemplateColumns }}
    >
      {showTaskRail ? (
        <div
          data-gantt-rail=""
          className="sticky left-0 z-[11] h-full border-r border-border bg-background"
        >
          <button
            type="button"
            className="flex min-h-[44px] w-full min-w-0 flex-col items-start justify-center gap-0.5 px-2 py-2 text-left transition-colors hover:bg-muted sm:min-h-0 sm:px-3 sm:py-1.5"
            onClick={onOpenTask}
          >
            <div className="flex w-full items-center gap-1.5">
              <span className="max-w-[7rem] truncate rounded-full bg-secondary px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-secondary-foreground sm:max-w-none">
                {getStatusLabel(task.status)}
              </span>
              <span className="truncate text-[10px] text-muted-foreground">
                {projectSlug}-{task.number}
              </span>
            </div>
            <p className="w-full line-clamp-1 text-xs font-medium leading-tight text-foreground">
              {task.title}
            </p>
            <p className="w-full truncate text-[11px] leading-tight text-muted-foreground">
              {format(task.scheduleStart, "MMM d, yyyy")} -{" "}
              {format(task.scheduleEnd, "MMM d, yyyy")}
              {showAssignee && task.assigneeName
                ? ` • ${task.assigneeName}`
                : ""}
            </p>
          </button>
        </div>
      ) : null}

      <div
        className="relative min-h-11 shrink-0 cursor-grab select-none"
        style={{
          minWidth: `${timeline.timelineMinWidthRem}rem`,
        }}
      >
        <GanttTaskBar
          task={task}
          timeline={timeline}
          pixelsPerDay={pixelsPerDay}
          isMobile={isMobile}
          laneDrag={laneDrag}
          onCommit={onCommit}
          onOpenTask={onOpenTask}
        />
      </div>
    </div>
  );
}
