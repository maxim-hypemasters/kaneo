import { useTranslation } from "react-i18next";
import { useSetTaskMilestone } from "@/hooks/mutations/milestone/use-milestone-mutations";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import { MilestonePicker } from "./milestone-picker";
export function TaskMilestoneProperty({
  task,
  className,
}: {
  task: Task;
  className?: string;
}) {
  const { t } = useTranslation();
  const { canUpdateTasks } = useWorkspacePermission();
  const mutation = useSetTaskMilestone(task.projectId, task.featureId ?? "");
  if (task.type === "feature" || !task.featureId) return null;
  return (
    <MilestonePicker
      projectId={task.projectId}
      featureId={task.featureId}
      value={task.milestoneId ?? null}
      className={className}
      disabled={!canUpdateTasks() || mutation.isPending}
      onChange={(id) => {
        void mutation
          .mutateAsync({ id: task.id, milestoneId: id })
          .catch(() => toast.error(t("tasks:milestones.assignmentError")));
      }}
    />
  );
}
