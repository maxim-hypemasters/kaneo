import { ExternalLinksAccordion } from "@/components/external-links/external-links-accordion";
import useExternalLinks from "@/hooks/queries/external-link/use-external-links";
import type { ExternalLink } from "@/types/external-link";
import type Task from "@/types/task";
import TaskRelations from "./task-relations";

export function TaskRelatedContent({
  task,
  workspaceId,
}: {
  task: Task;
  workspaceId: string;
}) {
  const { data: externalLinks = [], isLoading } = useExternalLinks(task.id);
  return (
    <div className="flex flex-col gap-6">
      <TaskRelations
        taskId={task.id}
        projectId={task.projectId}
        workspaceId={workspaceId}
        task={task}
      />
      <ExternalLinksAccordion
        taskId={task.id}
        externalLinks={externalLinks as ExternalLink[]}
        isLoading={isLoading}
      />
    </div>
  );
}
