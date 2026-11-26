import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { cn } from "@/lib/cn";
import { AiAgentSection } from "./ai-agent/ai-agent-section";
import { FeatureBreadcrumb } from "./features/feature-breadcrumb";
import { TaskActivity } from "./task-activity";
import TaskDescription from "./task-description";
import { TaskRelatedContent } from "./task-related-content";
import { FeatureWorkspace } from "./features/workspace/feature-workspace";
import TaskTitle from "./task-title";
import { TriageBanner } from "./triage-banner";
import { TRIAGE_STATUS } from "@/lib/triage/triage-status";
import { TaskDetailsSkeleton } from "./task-page-skeleton";

type TaskDetailsContentProps = {
  taskId: string | undefined;
  projectId: string;
  workspaceId: string;
  className?: string;
  variant?: "sheet" | "page";
  properties?: ReactNode;
};

export default function TaskDetailsContent({
  taskId,
  projectId,
  workspaceId,
  className,
  variant = "sheet",
  properties,
}: TaskDetailsContentProps) {
  const { t } = useTranslation();
  const query = useGetTask(taskId ?? "");
  const { data: task } = query;

  if (!taskId) return null;
  // Wait for the entity type before mounting its content queries. A Feature
  // opening in a sheet must not briefly request the legacy activity feed.
  if (!task)
    return query.isError ? (
      <div role="alert" className="space-y-3 p-5">
        <p>{t("tasks:common.taskNotFound")}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void query.refetch()}
        >
          {t("common:error.tryAgain")}
        </Button>
      </div>
    ) : (
      <TaskDetailsSkeleton />
    );

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex flex-col gap-2.5 pb-4">
        {task && <FeatureBreadcrumb task={task} workspaceId={workspaceId} />}
        <TaskTitle taskId={taskId} size={variant === "page" ? "lg" : "md"} />
      </div>

      {task.status === TRIAGE_STATUS ? <TriageBanner task={task} /> : null}

      {properties}

      {task?.type === "feature" ? (
        <FeatureWorkspace
          key={taskId}
          feature={task}
          workspaceId={workspaceId}
        />
      ) : (
        <>
          <AiAgentSection key={taskId} task={task} />
          <TaskDescription taskId={taskId} />
          {task && (
            <div className="mt-6">
              <TaskRelatedContent task={task} workspaceId={workspaceId} />
            </div>
          )}
          <TaskActivity
            taskId={taskId}
            projectId={projectId}
            className="mt-8 border-border border-t pt-6"
          />
        </>
      )}
    </div>
  );
}
