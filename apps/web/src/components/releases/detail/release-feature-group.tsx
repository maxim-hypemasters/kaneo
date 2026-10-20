import { Layers } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { ReleaseFeatureGroup as Group } from "./group-release-items";
import { type ReleaseItemColumn, ReleaseItemRow } from "./release-item-row";
import { ReleaseTaskLink } from "./release-task-link";
import {
  getReleaseWorkProgress,
  groupReleaseMilestones,
  type ReleaseMilestoneMetadata,
} from "./release-milestone-groups";
import { ReleaseMilestoneSection } from "./release-milestone-section";
import { ReleaseWorkProgress } from "./release-work-progress";

type ReleaseFeatureGroupProps = {
  group: Group;
  workspaceId: string;
  releaseId: string;
  projectSlug: string | undefined;
  columns: ReadonlyMap<string, ReleaseItemColumn>;
  done: ReadonlySet<string>;
  started: ReadonlySet<string>;
  milestones: readonly ReleaseMilestoneMetadata[] | undefined;
  progressReady: boolean;
};

export function ReleaseFeatureGroup({
  group,
  workspaceId,
  releaseId,
  projectSlug,
  columns,
  done,
  started,
  milestones,
  progressReady,
}: ReleaseFeatureGroupProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const { feature } = group;
  const progress = getReleaseWorkProgress(group.tasks, done, started);
  const milestoneGroups = groupReleaseMilestones(
    group.tasks,
    milestones,
    releaseId,
  );

  return (
    <section aria-labelledby={titleId}>
      <div className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 border-border/60 border-b bg-muted/40 px-4 py-2">
        <h3 className="flex max-w-full min-w-0 items-center gap-2 font-medium text-sm">
          <Layers
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <ReleaseTaskLink
            workspaceId={workspaceId}
            projectId={feature.projectId}
            releaseId={releaseId}
            taskId={feature.id}
            className="touch-hitbox relative flex min-w-0 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span id={titleId} className="truncate">
              {feature.title}
            </span>
          </ReleaseTaskLink>
        </h3>
        <ReleaseWorkProgress progress={progress} ready={progressReady} glyph />
        {group.tasksElsewhere > 0 ? (
          <span className="ml-auto text-muted-foreground text-xs">
            {t("tasks:releases.detail.tasksElsewhere", {
              count: group.tasksElsewhere,
            })}
          </span>
        ) : null}
      </div>
      {milestoneGroups ? (
        milestoneGroups.map((milestoneGroup) => (
          <ReleaseMilestoneSection
            key={milestoneGroup.milestone?.id ?? "unassigned"}
            group={milestoneGroup}
            projectId={feature.projectId}
            workspaceId={workspaceId}
            releaseId={releaseId}
            projectSlug={projectSlug}
            columns={columns}
            done={done}
            started={started}
            progressReady={progressReady}
          />
        ))
      ) : group.tasks.length > 0 ? (
        <ul>
          {group.tasks.map((task) => (
            <ReleaseItemRow
              key={task.id}
              task={task}
              workspaceId={workspaceId}
              releaseId={releaseId}
              projectSlug={projectSlug}
              column={columns.get(task.status ?? "")}
              done={done.has(task.status ?? "")}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
