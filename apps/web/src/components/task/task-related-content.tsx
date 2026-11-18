import { bugLabel } from "@/components/test-cases/bug-label";
import { LinkedTestCases } from "@/components/test-cases/linked-test-cases";
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
      {task.type === "bug" && (
        <LinkedTestCases
          projectId={task.projectId}
          link={{ bug: { id: task.id, label: bugLabel(task) } }}
        />
      )}
    </div>
  );
}
