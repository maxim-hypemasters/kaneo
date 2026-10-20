import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ReleaseItemGroups as Groups } from "./group-release-items";
import { ReleaseFeatureGroup } from "./release-feature-group";
import { type ReleaseItemColumn, ReleaseItemRow } from "./release-item-row";
import type { ReleaseMilestoneMetadata } from "./release-milestone-groups";

type ReleaseItemGroupsProps = {
  groups: Groups;
  workspaceId: string;
  releaseId: string;
  projectSlug: string | undefined;
  columns: ReadonlyMap<string, ReleaseItemColumn>;
  done: ReadonlySet<string>;
  started: ReadonlySet<string>;
  milestones: readonly ReleaseMilestoneMetadata[] | undefined;
  progressReady: boolean;
};

export function ReleaseItemGroups({
  groups,
  milestones,
  ...rowProps
}: ReleaseItemGroupsProps) {
  const { t } = useTranslation();
  const standaloneId = useId();
  const { columns, done } = rowProps;
  const milestonesByFeature = useMemo(() => {
    if (milestones === undefined) return undefined;
    const byFeature = new Map<string, ReleaseMilestoneMetadata[]>();
    for (const milestone of milestones) {
      const featureMilestones = byFeature.get(milestone.featureId) ?? [];
      featureMilestones.push(milestone);
      byFeature.set(milestone.featureId, featureMilestones);
    }
    return byFeature;
  }, [milestones]);

  return (
    <div>
      {groups.features.map((group) => (
        <ReleaseFeatureGroup
          key={group.feature.id}
          group={group}
          milestones={
            milestonesByFeature?.get(group.feature.id) ??
            (milestonesByFeature ? [] : undefined)
          }
          {...rowProps}
        />
      ))}
      {groups.standalone.length > 0 ? (
        <section aria-labelledby={standaloneId}>
          <h3
            id={standaloneId}
            className="flex h-10 items-center border-border/60 border-b bg-muted/40 px-4 font-medium text-sm"
          >
            {t("tasks:releases.detail.standaloneHeading")}
          </h3>
          <ul>
            {groups.standalone.map((task) => (
              <ReleaseItemRow
                key={task.id}
                task={task}
                workspaceId={rowProps.workspaceId}
                releaseId={rowProps.releaseId}
                projectSlug={rowProps.projectSlug}
                column={columns.get(task.status)}
                done={done.has(task.status)}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
