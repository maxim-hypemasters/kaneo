import { useNavigate } from "@tanstack/react-router";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { TaskRowBody } from "@/components/list-view/task-row-body";
import { useTaskHoverPrefetch } from "@/hooks/use-task-hover-prefetch";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import type Task from "@/types/task";
import { TriageDecisionButtons } from "./triage-decision-buttons";
import { TriageReporter } from "./triage-reporter";

type Member = {
  userId: string;
  user?: { name?: string; image?: string | null };
};

type TriageTaskRowProps = {
  task: Task;
  projectSlug: string | undefined;
  workspaceId: string;
  members: readonly Member[] | undefined;
  canTriage: boolean;
};

export const TriageTaskRow = memo(function TriageTaskRow({
  task,
  projectSlug,
  workspaceId,
  members,
  canTriage,
}: TriageTaskRowProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const hoverPrefetch = useTaskHoverPrefetch(task.id);
  const assignee = members?.find((member) => member.userId === task.userId);

  const open = () =>
    navigate({ to: ".", search: { taskId: task.id }, replace: false });

  return (
    <li className="border-b border-border/50">
      <div
        onClick={open}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && event.key === "Enter")
            open();
        }}
        role="button"
        tabIndex={0}
        data-task-id={task.id}
        className="group flex min-h-10 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-1.5 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset xl:flex-nowrap"
        {...hoverPrefetch}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <TaskRowBody
            task={task}
            projectSlug={projectSlug}
            workspaceId={workspaceId}
            isCompleted={false}
            assigneeName={assignee?.user?.name ?? task.assigneeName}
            assigneeImage={assignee?.user?.image}
            showPullRequests={false}
          />
        </div>
        <div className="flex w-full items-center gap-3 xl:w-auto">
          <TriageReporter task={task} members={members} />
          <time
            dateTime={task.createdAt}
            title={formatDateTime(task.createdAt, i18n.language)}
            className="shrink-0 text-xs text-muted-foreground tabular-nums"
          >
            {formatRelativeTime(task.createdAt, i18n.language)}
          </time>
          <div className="ml-auto">
            {canTriage ? (
              <TriageDecisionButtons taskId={task.id} taskTitle={task.title} />
            ) : (
              <span className="text-xs text-muted-foreground">
                {t("tasks:triage.waiting")}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
});
