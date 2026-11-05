import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AssigneeAvatar } from "@/components/task/properties/assignee-avatar";
import { cn } from "@/lib/cn";
import type { ReleasePlanTask } from "@/types/release-plan";
import { planningFeedback } from "../planning-feedback";
import { clearsPlacement } from "../preview/preview-model";
import { ResolutionTaskLabel } from "./resolution-task-label";

export function ConflictTaskRow({
  task,
  late = false,
  timeZone,
  showFeature,
  children,
  onFocusTask,
  onOpenTask,
  taskHref,
}: {
  task: ReleasePlanTask;
  timeZone: string;
  showFeature: boolean;
  late?: boolean;
  children?: ReactNode;
  onFocusTask?: (taskId: string) => void;
  onOpenTask?: (taskId: string) => void;
  taskHref?: string;
}) {
  const { t, i18n } = useTranslation();
  const archived = task.reason === "archived";
  const finish =
    task.end && !archived
      ? new Intl.DateTimeFormat(i18n?.resolvedLanguage ?? "en-US", {
          timeZone,
          month: "short",
          day: "numeric",
        }).format(new Date(task.end))
      : null;
  const focusTask = finish && task.start ? onFocusTask : undefined;
  const assignee =
    task.assigneeName ??
    t(
      task.assigneeId
        ? "common:people.unknown"
        : "tasks:releases.planning.unassigned",
    );
  return (
    <li className="relative isolate flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0">
      {focusTask && (
        <button
          type="button"
          aria-label={t("tasks:releases.planning.resolution.focusTask", {
            title: task.title,
          })}
          className="absolute inset-0 z-0 cursor-pointer rounded-sm outline-none hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={() => focusTask(task.taskId)}
        />
      )}
      <div
        className={cn(
          "relative flex min-w-0 flex-col gap-1.5",
          focusTask && "pointer-events-none",
        )}
      >
        <ResolutionTaskLabel
          task={task}
          href={taskHref}
          onOpenTask={onOpenTask}
        />
        {showFeature && task.featureTitle && (
          <p
            className="truncate text-xs text-muted-foreground"
            title={task.featureTitle}
          >
            {task.featureTitle}
          </p>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span
            className="inline-flex min-w-0 items-center gap-1.5"
            title={assignee}
          >
            <AssigneeAvatar
              assigned={Boolean(task.assigneeId)}
              name={task.assigneeName}
              image={null}
              className="size-4"
            />
            <span className="max-w-40 truncate">{assignee}</span>
          </span>
          {finish ? (
            <time
              dateTime={task.end ?? undefined}
              className={late ? "text-warning" : undefined}
            >
              {late && (
                <span className="sr-only">
                  {t("tasks:scheduling.reasons.afterCodeFreeze")}{" "}
                </span>
              )}
              {finish}
            </time>
          ) : (
            <span>
              {task.reason
                ? planningFeedback(task.reason, t)
                : task.completed
                  ? t("tasks:releases.planning.previewChart.completed")
                  : t("tasks:releases.planning.notScheduled")}
            </span>
          )}
        </div>
        {!finish && clearsPlacement(task) && (
          <p className="text-xs text-warning">
            {t("tasks:releases.planning.previewChart.clearsPlacement")}
          </p>
        )}
      </div>
      {children && <div className="relative z-10 self-start">{children}</div>}
    </li>
  );
}
