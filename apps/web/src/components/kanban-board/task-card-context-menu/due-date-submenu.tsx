import { isBefore, isSameDay, startOfDay } from "date-fns";
import { Calendar, CalendarDays, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MonthGrid } from "@/components/common/date-picker/month-grid";
import {
  formatPickerDay,
  QUICK_DATE_LABEL_KEYS,
} from "@/components/common/date-picker/quick-date-labels";
import { getQuickDates } from "@/components/common/date-picker/quick-dates";
import {
  ContextMenuCheckboxItem,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useAssigneeBlockedDays } from "@/components/time-off/away/use-assignee-blocked-days";
import { useUpdateTaskDueDate } from "@/hooks/mutations/task/use-update-task-due-date";
import { toastTaskSaveError } from "@/lib/time-off/task-away-error";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type Task from "@/types/task";

export function DueDateSubmenu({ task }: { task: Task }) {
  const { t } = useTranslation();
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const { mutateAsync: updateTaskDueDate } = useUpdateTaskDueDate();
  const value = task.dueDate ? new Date(task.dueDate) : null;
  const start = task.startDate ? new Date(task.startDate) : undefined;
  // Mounted only while the menu is open, so closed cards load nothing.
  const blocked = useAssigneeBlockedDays(
    { userId: task.userId, name: task.assigneeName },
    value,
  );
  const quickDates = getQuickDates(new Date(), weekStartsOn).filter(
    (item) =>
      (!start || !isBefore(item.date, startOfDay(start))) &&
      !blocked?.isBlocked(item.date),
  );

  const setDueDate = async (date: Date | null) => {
    try {
      await updateTaskDueDate({
        ...task,
        dueDate: date?.toISOString() ?? null,
      });
    } catch (error) {
      toastTaskSaveError(error, t("tasks:dueDate.updateError"));
    }
  };

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Calendar className="size-3.5 text-muted-foreground" />
        <span>{t("tasks:dueDate.label")}</span>
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-60">
        {quickDates.map((item) => (
          <ContextMenuCheckboxItem
            key={item.id}
            checked={value ? isSameDay(value, item.date) : false}
            onCheckedChange={() => setDueDate(item.date)}
            closeOnClick
          >
            <Calendar className="size-3.5 text-muted-foreground" />
            <span className="flex-1 whitespace-nowrap">
              {t(QUICK_DATE_LABEL_KEYS[item.id])}
            </span>
            <span className="whitespace-nowrap text-muted-foreground text-xs">
              {formatPickerDay(item.date)}
            </span>
          </ContextMenuCheckboxItem>
        ))}
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger inset>
            <CalendarDays className="size-3.5 text-muted-foreground" />
            <span>{t("tasks:datePicker.pickDate")}</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-65 p-0">
            <MonthGrid
              value={value}
              onSelect={setDueDate}
              disabled={[
                ...(start ? [{ before: start }] : []),
                ...(blocked ? [blocked.isBlocked] : []),
              ]}
              marked={start}
              away={blocked?.isBlocked}
              onMonthChange={blocked?.onMonthChange}
              autoFocus={false}
            />
          </ContextMenuSubContent>
        </ContextMenuSub>
        {value && (
          <ContextMenuItem
            inset
            className="[&>svg]:mx-0"
            onClick={() => setDueDate(null)}
          >
            <X className="size-3.5 text-muted-foreground" />
            <span>{t("tasks:dueDate.clear")}</span>
          </ContextMenuItem>
        )}
        {(start || blocked?.hint) && (
          <>
            <ContextMenuSeparator />
            {start && (
              <p className="py-1.5 ps-8 pe-2 text-muted-foreground text-xs">
                {t("tasks:datePicker.startsOn", {
                  date: formatPickerDay(start),
                })}
              </p>
            )}
            {blocked?.hint && (
              <p className="py-1.5 ps-8 pe-2 text-muted-foreground text-xs">
                {blocked.hint}
              </p>
            )}
          </>
        )}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
