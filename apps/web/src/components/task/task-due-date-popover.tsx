import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTaskDueDate } from "@/hooks/mutations/task/use-update-task-due-date";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toastTaskSaveError } from "@/lib/time-off/task-away-error";
import type Task from "@/types/task";
import { AssigneeDatePickerMenu } from "./assignee-date-picker-menu";

type TaskDueDatePopoverProps = {
  task: Task;
  children: React.ReactNode;
};

export default function TaskDueDatePopover({
  task,
  children,
}: TaskDueDatePopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutateAsync: updateTaskDueDate } = useUpdateTaskDueDate();
  const { canWorkItem } = useWorkspacePermission();
  const canEdit = canWorkItem(task.type, "update");

  const handleDateChange = async (date: Date | null) => {
    try {
      await updateTaskDueDate({
        ...task,
        dueDate: date?.toISOString() ?? null,
      });
      setOpen(false);
    } catch (error) {
      toastTaskSaveError(error, t("tasks:popover.dueDate.updateError"));
    }
  };

  if (!canEdit) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-65 p-0" align="start">
        {/* A date set by hand belongs to the task's own assignee. */}
        <AssigneeDatePickerMenu
          assignee={{ userId: task.userId, name: task.assigneeName }}
          label={t("tasks:dueDate.label")}
          placeholder={t("tasks:datePicker.dueDatePlaceholder")}
          clearLabel={t("tasks:popover.dueDate.clear")}
          value={task.dueDate ? new Date(task.dueDate) : null}
          onChange={handleDateChange}
          bounds={
            task.startDate ? { before: new Date(task.startDate) } : undefined
          }
          formatLimit={(date) => t("tasks:datePicker.startsOn", { date })}
        />
      </PopoverContent>
    </Popover>
  );
}
