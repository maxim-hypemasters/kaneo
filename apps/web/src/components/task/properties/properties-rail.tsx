import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { TaskCustomFieldRows } from "../custom-fields/task-custom-field-rows";
import { FeatureMilestoneOverview } from "../milestones/feature-milestone-overview";
import { TaskPlanningCard } from "./task-planning-card";
import { TaskPropertiesCard } from "./task-properties-card";
import { useTaskProperties } from "./use-task-properties";

type PropertiesRailProps = {
  taskId: string;
  projectId: string;
  workspaceId: string;
  className?: string;
};

export function PropertiesRail({
  taskId,
  projectId,
  workspaceId,
  className,
}: PropertiesRailProps) {
  const { t } = useTranslation();
  const { task, ...properties } = useTaskProperties(
    taskId,
    projectId,
    workspaceId,
  );

  if (!task) return null;

  return (
    <aside
      aria-label={t("tasks:properties.title")}
      className={cn("flex flex-col gap-3 px-2.5 pt-3 pb-6", className)}
    >
      <TaskPropertiesCard
        task={task}
        workspaceId={workspaceId}
        {...properties}
      />
      <TaskPlanningCard task={task} workspaceId={workspaceId} {...properties} />
      <TaskCustomFieldRows taskId={taskId} projectId={projectId} />
      {properties.isFeature && (
        <FeatureMilestoneOverview
          projectId={task.projectId}
          featureId={task.id}
          placement="rail"
        />
      )}
    </aside>
  );
}
