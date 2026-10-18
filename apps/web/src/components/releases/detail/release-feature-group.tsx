import { Layers } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { ReleaseFeatureGroup as Group } from "./group-release-items";
import { type ReleaseItemColumn, ReleaseItemRow } from "./release-item-row";
import { ReleaseTaskLink } from "./release-task-link";

type ReleaseFeatureGroupProps = {
  group: Group;
  workspaceId: string;
  releaseId: string;
  projectSlug: string | undefined;
  columns: ReadonlyMap<string, ReleaseItemColumn>;
  done: ReadonlySet<string>;
};

export function ReleaseFeatureGroup({
  group,
  workspaceId,
  releaseId,
  projectSlug,
  columns,
  done,
}: ReleaseFeatureGroupProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const statusId = useId();
  const { feature } = group;
  const featureDone = done.has(feature.status);
  // As text, like the task rows: strike-through alone says nothing to a
  // screen reader.
  const statusName =
    columns.get(feature.status)?.name ?? t("tasks:status.planned");

  return (
    <section aria-labelledby={titleId}>
      <div className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 border-border/60 border-b bg-muted/40 px-4 py-2">
        <h3 className="flex min-w-0 items-center gap-2 font-medium text-sm">
          <Layers
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <ReleaseTaskLink
            workspaceId={workspaceId}
            projectId={feature.projectId}
            releaseId={releaseId}
            taskId={feature.id}
            aria-describedby={statusId}
            className={cn(
              "touch-hitbox relative flex min-w-0 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring",
              featureDone && "text-muted-foreground line-through",
            )}
          >
            <span id={titleId} className="truncate">
              {feature.title}
            </span>
          </ReleaseTaskLink>
          <span
            id={statusId}
            className="max-w-32 shrink-0 truncate font-normal text-muted-foreground text-xs"
          >
            {statusName}
          </span>
        </h3>
        {group.inRelease ? null : (
          <Badge variant="outline" size="sm">
            {t("tasks:releases.detail.featureElsewhere")}
          </Badge>
        )}
        {group.tasksElsewhere > 0 ? (
          <span className="ml-auto text-muted-foreground text-xs">
            {t("tasks:releases.detail.tasksElsewhere", {
              count: group.tasksElsewhere,
            })}
          </span>
        ) : null}
      </div>
      {group.tasks.length > 0 ? (
        <ul>
          {group.tasks.map((task) => (
            <ReleaseItemRow
              key={task.id}
              task={task}
              workspaceId={workspaceId}
              releaseId={releaseId}
              projectSlug={projectSlug}
              column={columns.get(task.status)}
              done={done.has(task.status)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
