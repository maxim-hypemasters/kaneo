import { ArrowRight, Calendar, CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RailCard } from "@/components/common/rail-card";
import { getColumnIcon } from "@/lib/column";
import { cn } from "@/lib/cn";
import { formatDateShort } from "@/lib/format";
import { getPriorityLabel } from "@/lib/i18n/domain";
import { getPriorityIcon } from "@/lib/priority";
import type Task from "@/types/task";
import { TaskEstimate } from "../estimate/task-estimate";
import TaskAssigneePopover from "../task-assignee-popover";
import TaskDueDatePopover from "../task-due-date-popover";
import TaskLabelsPopover from "../task-labels-popover";
import TaskPriorityPopover from "../task-priority-popover";
import TaskStartDatePopover from "../task-start-date-popover";
import TaskStatusPopover from "../task-status-popover";
import { AssigneeAvatar } from "./assignee-avatar";
import { dueDateTextClass } from "./due-date-text-class";
import { LabelsValue } from "./labels-value";
import { PropertyRow } from "./property-row";
import { PropertyValue } from "./property-value";
import type { useTaskProperties } from "./use-task-properties";

type TaskPropertiesCardProps = Pick<
  ReturnType<typeof useTaskProperties>,
  "labels" | "status" | "assignee" | "dueStatus" | "isFeature"
> & {
  task: Task;
  workspaceId: string;
};

// The task's own state: who works on it, when, and how far along it is.
export function TaskPropertiesCard({
  task,
  workspaceId,
  labels,
  status,
  assignee,
  dueStatus,
  isFeature,
}: TaskPropertiesCardProps) {
  const { t } = useTranslation();

  return (
    <RailCard title={t("tasks:properties.title")}>
      <div className="flex flex-col gap-0.5">
        {!isFeature && (
          <>
            <PropertyRow label={t("tasks:status.label")}>
              <TaskStatusPopover task={task}>
                <PropertyValue
                  data-task-action="status"
                  shortcutId="changeStatus"
                >
                  {getColumnIcon(
                    task.status ?? "",
                    status.isFinal,
                    status.icon,
                  )}
                  <span className="truncate">{status.label}</span>
                </PropertyValue>
              </TaskStatusPopover>
            </PropertyRow>

            <PropertyRow label={t("tasks:priority.label")}>
              <TaskPriorityPopover task={task}>
                <PropertyValue
                  data-task-action="priority"
                  shortcutId="changePriority"
                >
                  {getPriorityIcon(task.priority ?? "")}
                  <span className="truncate">
                    {getPriorityLabel(task.priority ?? "")}
                  </span>
                </PropertyValue>
              </TaskPriorityPopover>
            </PropertyRow>

            <PropertyRow label={t("tasks:estimate.label")}>
              <TaskEstimate task={task} variant="property" />
            </PropertyRow>

            <PropertyRow label={t("tasks:assignee.label")}>
              <TaskAssigneePopover task={task} workspaceId={workspaceId}>
                <PropertyValue
                  data-task-action="assignee"
                  shortcutId="assignTask"
                >
                  <AssigneeAvatar
                    name={assignee?.user?.name || task.assigneeName}
                    image={assignee?.user?.image}
                    assigned={Boolean(task.userId)}
                  />
                  <span
                    className={cn(
                      "truncate",
                      !task.userId && "text-muted-foreground",
                    )}
                  >
                    {assignee?.user?.name ||
                      task.assigneeName ||
                      t("tasks:popover.assignee.unassigned")}
                  </span>
                </PropertyValue>
              </TaskAssigneePopover>
            </PropertyRow>

            <PropertyRow label={t("tasks:properties.dates")}>
              <div className="flex min-w-0 items-center gap-0.5">
                <TaskStartDatePopover task={task}>
                  <PropertyValue className="flex-initial">
                    <CalendarDays className="text-muted-foreground" />
                    <span
                      className={cn(
                        "truncate",
                        !task.startDate && "text-muted-foreground",
                      )}
                    >
                      {task.startDate
                        ? formatDateShort(task.startDate)
                        : t("tasks:properties.start")}
                    </span>
                  </PropertyValue>
                </TaskStartDatePopover>
                <ArrowRight className="size-3 shrink-0 text-muted-foreground/60" />
                <TaskDueDatePopover task={task}>
                  <PropertyValue
                    data-task-action="dueDate"
                    className={cn("flex-initial", dueDateTextClass[dueStatus])}
                  >
                    <Calendar
                      className={cn(!task.dueDate && "text-muted-foreground")}
                    />
                    <span
                      className={cn(
                        "truncate",
                        !task.dueDate && "text-muted-foreground",
                      )}
                    >
                      {task.dueDate
                        ? formatDateShort(task.dueDate)
                        : t("tasks:dueDate.label")}
                    </span>
                  </PropertyValue>
                </TaskDueDatePopover>
              </div>
            </PropertyRow>
          </>
        )}

        <PropertyRow label={t("tasks:properties.labels")} align="start">
          <TaskLabelsPopover task={task} workspaceId={workspaceId}>
            <PropertyValue
              data-task-action="labels"
              shortcutId="changeLabels"
              className="h-auto min-h-7.5 py-1.25"
            >
              <LabelsValue labels={labels} />
            </PropertyValue>
          </TaskLabelsPopover>
        </PropertyRow>
      </div>
    </RailCard>
  );
}
