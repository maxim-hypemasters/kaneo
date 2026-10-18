import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { ReleaseItemGroups as Groups } from "./group-release-items";
import { ReleaseFeatureGroup } from "./release-feature-group";
import { type ReleaseItemColumn, ReleaseItemRow } from "./release-item-row";

type ReleaseItemGroupsProps = {
  groups: Groups;
  workspaceId: string;
  releaseId: string;
  projectSlug: string | undefined;
  columns: ReadonlyMap<string, ReleaseItemColumn>;
  done: ReadonlySet<string>;
};

export function ReleaseItemGroups({
  groups,
  ...rowProps
}: ReleaseItemGroupsProps) {
  const { t } = useTranslation();
  const standaloneId = useId();
  const { columns, done } = rowProps;

  return (
    <div>
      {groups.features.map((group) => (
        <ReleaseFeatureGroup
          key={group.feature.id}
          group={group}
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
