import type Task from "@/types/task";
import TaskRelations from "./task-relations";
import { TaskResources } from "./task-resources";

export function TaskRelatedContent({
  task,
  workspaceId,
}: {
  task: Task;
  workspaceId: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <TaskRelations
        taskId={task.id}
        projectId={task.projectId}
        workspaceId={workspaceId}
        task={task}
      />
      <TaskResources taskId={task.id} />
    </div>
  );
}
