import { useContext } from "react";
import { AuthContext } from "@/components/providers/auth-provider";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { TaskDescriptionDocument } from "./task-description-document";

type TaskDescriptionProps = {
  taskId: string;
};

export default function TaskDescription({ taskId }: TaskDescriptionProps) {
  const { data: task, refetch } = useGetTask(taskId);
  const { canUpdateTasks } = useWorkspacePermission();
  const ownerId = useContext(AuthContext).user?.id ?? "";

  if (!task) return null;

  return (
    <TaskDescriptionDocument
      key={`${ownerId}:${taskId}`}
      taskId={taskId}
      projectId={task.projectId}
      description={task.description ?? ""}
      canEdit={canUpdateTasks()}
      refresh={() => refetch({ throwOnError: true })}
    />
  );
}
