import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTaskAssignee } from "@/hooks/mutations/task/use-update-task-assignee";
import useGetProjectMembers from "@/hooks/queries/workspace-users/use-get-project-members";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toastTaskSaveError } from "@/lib/time-off/task-away-error";
import type Task from "@/types/task";
import { AssigneePickerMenu } from "./assignee-picker-menu";

type TaskAssigneePopoverProps = {
  task: Task;
  workspaceId: string;
  children: React.ReactNode;
};

export default function TaskAssigneePopover({
  task,
  workspaceId,
  children,
}: TaskAssigneePopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutateAsync: updateTaskAssignee } = useUpdateTaskAssignee();
  const { data: members = [] } = useGetProjectMembers({
    workspaceId,
    projectId: task.projectId,
  });
  const { canAssignTasks } = useWorkspacePermission();

  if (!canAssignTasks()) return <>{children}</>;

  const changeAssignee = async (userId: string) => {
    setOpen(false);
    try {
      await updateTaskAssignee({ ...task, userId });
    } catch (error) {
      toastTaskSaveError(error, t("tasks:popover.assignee.updateError"));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <AssigneePickerMenu
          workspaceId={workspaceId}
          members={members}
          current={task.userId ?? null}
          onSelect={changeAssignee}
        />
      </PopoverContent>
    </Popover>
  );
}
