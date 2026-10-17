import type { ReactNode } from "react";
import { ExternalLinksAccordion } from "@/components/external-links/external-links-accordion";
import useExternalLinks from "@/hooks/queries/external-link/use-external-links";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { cn } from "@/lib/cn";
import type { ExternalLink } from "@/types/external-link";
import { FeatureBreadcrumb } from "./features/feature-breadcrumb";
import { TaskActivity } from "./task-activity";
import TaskDescription from "./task-description";
import TaskRelations from "./task-relations";
import TaskSubtasks from "./task-subtasks";
import TaskTitle from "./task-title";

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
  const { data: task } = useGetTask(taskId ?? "");
  const { data: externalLinks = [], isLoading: isLoadingExternalLinks } =
    useExternalLinks(taskId ?? "");

  if (!taskId) return null;

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex flex-col gap-2.5 pb-4">
        {task && <FeatureBreadcrumb task={task} workspaceId={workspaceId} />}
        <TaskTitle taskId={taskId} size={variant === "page" ? "lg" : "md"} />
      </div>

      {properties}

      <TaskDescription taskId={taskId} />

      <div className="mt-6 flex flex-col gap-6">
        {task?.type === "feature" && (
          <TaskSubtasks
            featureId={taskId}
            projectId={task.projectId}
            workspaceId={workspaceId}
            featureStatus={task.status}
          />
        )}
        <TaskRelations
          taskId={taskId}
          projectId={projectId}
          workspaceId={workspaceId}
          task={task}
        />
        <ExternalLinksAccordion
          taskId={taskId}
          externalLinks={externalLinks as ExternalLink[]}
          isLoading={isLoadingExternalLinks}
        />
      </div>

      <TaskActivity
        taskId={taskId}
        projectId={projectId}
        className="mt-8 border-border border-t pt-6"
      />
    </div>
  );
}
