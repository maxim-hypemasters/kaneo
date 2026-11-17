import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTaskStartDate } from "@/hooks/mutations/task/use-update-task-start-date";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toastTaskSaveError } from "@/lib/time-off/task-away-error";
import type Task from "@/types/task";
import { AssigneeDatePickerMenu } from "./assignee-date-picker-menu";

type TaskStartDatePopoverProps = {
  task: Task;
  children: React.ReactNode;
};

export default function TaskStartDatePopover({
  task,
  children,
}: TaskStartDatePopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutateAsync: updateTask } = useUpdateTaskStartDate();
  const { canWorkItem } = useWorkspacePermission();
  const canEdit = canWorkItem(task.type, "update");

  const handleDateChange = async (date: Date | null) => {
    try {
      await updateTask({
        ...task,
        startDate: date?.toISOString() ?? null,
      });
      setOpen(false);
    } catch (error) {
      toastTaskSaveError(error, t("tasks:popover.startDate.updateError"));
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
          label={t("tasks:properties.startDate")}
          placeholder={t("tasks:datePicker.startDatePlaceholder")}
          clearLabel={t("tasks:popover.startDate.clear")}
          value={task.startDate ? new Date(task.startDate) : null}
          onChange={handleDateChange}
          bounds={task.dueDate ? { after: new Date(task.dueDate) } : undefined}
          formatLimit={(date) => t("tasks:due.fullDate", { date })}
        />
      </PopoverContent>
    </Popover>
  );
}
