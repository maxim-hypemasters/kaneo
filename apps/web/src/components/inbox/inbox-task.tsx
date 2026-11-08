import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import CommentInput from "@/components/activity/comment-input";
import { DueDateText } from "@/components/my-work/due-date-text";
import { Button } from "@/components/ui/button";
import useGetActivitiesByTaskId from "@/hooks/queries/activity/use-get-activities-by-task-id";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { getColumnIcon } from "@/lib/column";
import { getPriorityLabel, getStatusDisplayLabel } from "@/lib/i18n/domain";
import { getPriorityIcon } from "@/lib/priority";
import { useShortcut } from "@/lib/shortcuts/use-shortcut";
import {
  INBOX_VISIBLE_ACTIVITIES,
  InboxRecentActivity,
} from "./inbox-recent-activity";
import { InboxResourceState } from "./inbox-resource-state";

type InboxTaskProps = {
  taskId: string;
  workspaceId?: string;
};

// The task a notification points at, with enough of its thread to answer
// without leaving the inbox.
export function InboxTask({ taskId, workspaceId }: InboxTaskProps) {
  const { t } = useTranslation();
  const taskQuery = useGetTask(taskId, true);
  const task = taskQuery.data;
  const activityQuery = useGetActivitiesByTaskId(
    taskId,
    true,
    INBOX_VISIBLE_ACTIVITIES,
  );
  const { data: columns = [] } = useGetColumns(task?.projectId ?? "", {
    refreshWhileVisible: true,
  });
  const slugColumns = columns.filter((column) => column.slug === task?.status);
  const statusColumn =
    columns.find((column) => column.id === task?.columnId) ??
    (slugColumns.length === 1 ? slugColumns[0] : undefined);
  const { canUpdateTasks } = useWorkspacePermission();
  const navigate = useNavigate();
  const openWorkspaceId = task?.workspaceId || workspaceId;
  useShortcut(
    "openFocusedTask",
    () => {
      if (!task || !openWorkspaceId) return;
      navigate({
        to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
        params: {
          workspaceId: openWorkspaceId,
          projectId: task.projectId,
          taskId: task.id,
        },
      });
    },
    { enabled: Boolean(task && openWorkspaceId) },
  );

  if (taskQuery.isLoading || !task) {
    return (
      <InboxResourceState
        query={taskQuery}
        unavailableMessage={t("notifications:inbox.taskUnavailable")}
        loadErrorMessage={t("notifications:inbox.taskLoadError")}
      />
    );
  }

  const linkWorkspaceId = task.workspaceId || workspaceId;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="min-w-0 flex-1 font-semibold text-2xl text-foreground tracking-tight">
            {task.title}
          </h2>
          {linkWorkspaceId && (
            <Button
              variant="outline"
              size="xs"
              render={
                <Link
                  to="/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId"
                  params={{
                    workspaceId: linkWorkspaceId,
                    projectId: task.projectId,
                    taskId: task.id,
                  }}
                />
              }
            >
              {t("notifications:inbox.openTask")}
              <ArrowUpRight />
            </Button>
          )}
        </div>
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-foreground/85">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">{t("tasks:status.label")}</dt>
            <dd className="flex items-center gap-1.5">
              {getColumnIcon(
                task.status,
                statusColumn?.isFinal,
                statusColumn?.icon,
              )}
              {getStatusDisplayLabel(task.status, statusColumn?.name)}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">{t("tasks:priority.label")}</dt>
            <dd className="flex items-center gap-1.5 [&_svg]:size-3.5">
              {getPriorityIcon(task.priority ?? "")}
              {getPriorityLabel(task.priority ?? "no-priority")}
            </dd>
          </div>
          {task.dueDate && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">{t("tasks:dueDate.label")}</dt>
              <dd>
                <DueDateText dueDate={task.dueDate} className="text-[13px]" />
              </dd>
            </div>
          )}
          {task.assigneeName && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">{t("tasks:assignee.label")}</dt>
              <dd>{task.assigneeName}</dd>
            </div>
          )}
        </dl>
      </div>

      <InboxRecentActivity query={activityQuery}>
        {canUpdateTasks() && (
          <CommentInput taskId={taskId} projectId={task?.projectId} />
        )}
      </InboxRecentActivity>
    </div>
  );
}
