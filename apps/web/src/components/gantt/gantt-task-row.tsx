import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { format } from "date-fns";
import { Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
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
  // Assignee lanes already name the assignee, so their rows leave it out.
  showAssignee: boolean;
  // Feature lanes don't say who does the work, so their bars show it.
  showBarAssignee?: boolean;
  laneDrag?: GanttLaneDrag;
  onOpenTask: () => void;
  onCommit: (edit: GanttTaskEdit) => void;
  onDragChange?: (dragging: boolean) => void;
  dependencyNote?: string;
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
  showBarAssignee = false,
  laneDrag,
  onOpenTask,
  onCommit,
  onDragChange,
  dependencyNote,
}: GanttTaskRowProps) {
  const { t } = useTranslation();
  const isFeature = task.type === "feature";
  const counts = isFeature ? task.subtaskCounts : undefined;

  return (
    <div
      data-gantt-row={task.id}
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
            {isFeature ? (
              // The icon is no taller than the line, so the row keeps its
              // height.
              <p className="flex w-full min-w-0 items-center gap-1 text-xs font-semibold leading-tight text-foreground">
                <Layers
                  aria-hidden="true"
                  className="size-3 shrink-0 text-muted-foreground"
                />
                <span className="sr-only">{t("tasks:features.badge")}</span>{" "}
                <span className="min-w-0 truncate">{task.title}</span>
              </p>
            ) : (
              <p className="w-full line-clamp-1 text-xs font-medium leading-tight text-foreground">
                {task.type === "bug" && (
                  <TaskTypeGlyph
                    type="bug"
                    className="mr-1 inline-block size-3.5 shrink-0 align-text-bottom text-muted-foreground"
                  />
                )}
                {task.title}
              </p>
            )}
            <p className="w-full truncate text-[11px] leading-tight text-muted-foreground">
              {format(task.scheduleStart, "MMM d, yyyy")} -{" "}
              {format(task.scheduleEnd, "MMM d, yyyy")}
              {showAssignee && task.assigneeName
                ? ` • ${task.assigneeName}`
                : ""}
              {counts && counts.total > 0 ? (
                <>
                  <span aria-hidden="true" className="tabular-nums">
                    {` • ${t("tasks:gantt.featureBar.progress", {
                      completed: counts.completed,
                      total: counts.total,
                    })}`}
                  </span>
                  <span className="sr-only">
                    {`, ${t("tasks:gantt.featureBar.progressAria", {
                      completed: counts.completed,
                      count: counts.total,
                    })}`}
                  </span>
                </>
              ) : null}
            </p>
          </button>
        </div>
      ) : null}

      <div
        className={cn(
          "relative shrink-0 cursor-grab select-none",
          // Without the rail a row would be exactly as tall as its bar,
          // leaving dependency arrows no room to turn between rows.
          showTaskRail ? "min-h-11" : "min-h-12",
        )}
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
          onDragChange={onDragChange}
          dependencyNote={dependencyNote}
          showAssignee={showBarAssignee}
        />
      </div>
    </div>
  );
}
