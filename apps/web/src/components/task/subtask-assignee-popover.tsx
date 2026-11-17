import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTaskAssignee } from "@/hooks/mutations/task/use-update-task-assignee";
import useGetMembersOfProjects from "@/hooks/queries/workspace-users/use-get-members-of-projects";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toastTaskSaveError } from "@/lib/time-off/task-away-error";
import type Task from "@/types/task";
import { AssigneePickerMenu } from "./assignee-picker-menu";

type SubtaskAssigneePopoverProps = {
  tasks: Task[];
  workspaceId: string;
  children: React.ReactNode;
};

export default function SubtaskAssigneePopover({
  tasks,
  workspaceId,
  children,
}: SubtaskAssigneePopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutateAsync: updateTaskAssignee } = useUpdateTaskAssignee();
  const { data: members = [] } = useGetMembersOfProjects({
    workspaceId,
    projectIds: tasks.map((task) => task.projectId),
  });
  const { canAssignTasks } = useWorkspacePermission();

  if (!canAssignTasks()) return <>{children}</>;

  const current = tasks.every((task) => task.userId === tasks[0]?.userId)
    ? (tasks[0]?.userId ?? null)
    : undefined;

  const changeAssignee = async (userId: string) => {
    setOpen(false);
    try {
      await Promise.all(
        tasks.map((task) => updateTaskAssignee({ ...task, userId })),
      );
    } catch (error) {
      toastTaskSaveError(error, t("tasks:popover.assignee.updateError"));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <AssigneePickerMenu
          workspaceId={workspaceId}
          members={members}
          current={current}
          onSelect={changeAssignee}
        />
      </PopoverContent>
    </Popover>
  );
}
