import { useTranslation } from "react-i18next";
import { RailCard } from "@/components/common/rail-card";
import icons from "@/constants/project-icons";
import type Task from "@/types/task";
import { FeatureValue } from "../features/feature-value";
import { TaskFeaturePopover } from "../features/task-feature-popover";
import { TaskTypeMenu } from "../features/task-type-menu";
import { TaskTypeValue } from "../features/task-type-value";
import { TaskMilestoneProperty } from "../milestones/task-milestone-property";
import { ReleaseValue } from "../releases/release-value";
import { TaskReleasePopover } from "../releases/task-release-popover";
import TaskMovePopover from "../task-move-popover";
import { PropertyRow } from "./property-row";
import { PropertyStaticValue } from "./property-static-value";
import { PropertyValue } from "./property-value";
import type { useTaskProperties } from "./use-task-properties";

type TaskPlanningCardProps = Pick<
  ReturnType<typeof useTaskProperties>,
  | "project"
  | "canMoveTask"
  | "isFeature"
  | "feature"
  | "featureDisplayId"
  | "hasFeatureTasks"
  | "release"
> & {
  task: Task;
  workspaceId: string;
};

// Where the task belongs: its project, type, feature, milestone and release.
export function TaskPlanningCard({
  task,
  workspaceId,
  project,
  canMoveTask,
  isFeature,
  feature,
  featureDisplayId,
  hasFeatureTasks,
  release,
}: TaskPlanningCardProps) {
  const { t } = useTranslation();

  const ProjectIcon =
    icons[project?.icon as keyof typeof icons] || icons.Layout;
  const projectValue = (
    <>
      <ProjectIcon className="text-muted-foreground" />
      <span className="truncate">{project?.name}</span>
    </>
  );

  return (
    <RailCard title={t("tasks:properties.planning")}>
      <div className="flex flex-col gap-0.5">
        <PropertyRow label={t("tasks:properties.project")}>
          {canMoveTask ? (
            <TaskMovePopover task={task} workspaceId={workspaceId}>
              <PropertyValue data-task-action="move" shortcutId="moveToProject">
                {projectValue}
              </PropertyValue>
            </TaskMovePopover>
          ) : (
            <PropertyStaticValue>{projectValue}</PropertyStaticValue>
          )}
        </PropertyRow>

        <PropertyRow label={t("tasks:features.type")}>
          <TaskTypeMenu task={task} hasTasks={hasFeatureTasks}>
            <PropertyValue disabled={isFeature}>
              <TaskTypeValue type={task.type} />
            </PropertyValue>
          </TaskTypeMenu>
        </PropertyRow>

        {!isFeature && (
          <PropertyRow label={t("tasks:features.property")}>
            <TaskFeaturePopover
              task={task}
              feature={feature}
              workspaceId={workspaceId}
            >
              <PropertyValue data-task-action="feature" shortcutId="setParent">
                <FeatureValue feature={feature} displayId={featureDisplayId} />
              </PropertyValue>
            </TaskFeaturePopover>
          </PropertyRow>
        )}

        {!isFeature && task.featureId && (
          <PropertyRow label={t("tasks:milestones.property")}>
            <TaskMilestoneProperty
              task={task}
              className="h-7.5 border-0 px-2 text-[13px]"
            />
          </PropertyRow>
        )}

        {!isFeature && (
          <PropertyRow label={t("tasks:releases.property")}>
            <TaskReleasePopover task={task}>
              <PropertyValue data-task-action="release" shortcutId="setRelease">
                <ReleaseValue release={release} />
              </PropertyValue>
            </TaskReleasePopover>
          </PropertyRow>
        )}
      </div>
    </RailCard>
  );
}
