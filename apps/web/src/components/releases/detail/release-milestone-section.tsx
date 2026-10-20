import { Diamond } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { openMilestoneDetails } from "@/store/milestone-details";
import { cn } from "@/lib/cn";
import { type ReleaseItemColumn, ReleaseItemRow } from "./release-item-row";
import {
  getReleaseWorkProgress,
  type ReleaseMilestoneGroup,
} from "./release-milestone-groups";
import { ReleaseWorkProgress } from "./release-work-progress";

export function ReleaseMilestoneSection({
  group,
  projectId,
  workspaceId,
  releaseId,
  projectSlug,
  columns,
  done,
  started,
  progressReady,
}: {
  group: ReleaseMilestoneGroup;
  projectId: string;
  workspaceId: string;
  releaseId: string;
  projectSlug: string | undefined;
  columns: ReadonlyMap<string, ReleaseItemColumn>;
  done: ReadonlySet<string>;
  started: ReadonlySet<string>;
  progressReady: boolean;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const progress = getReleaseWorkProgress(group.tasks, done, started);
  return (
    <section aria-labelledby={titleId}>
      <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-border/50 border-b bg-muted/15 py-2 pr-4 pl-7 sm:pl-9">
        <h4
          id={titleId}
          className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium"
        >
          <Diamond
            aria-hidden="true"
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground",
              !group.milestone && "[stroke-dasharray:2_2]",
              progressReady && progress.started > 0 && "text-amber-500",
              progressReady &&
                progress.total > 0 &&
                progress.completed === progress.total &&
                "fill-primary text-primary",
            )}
          />
          {group.milestone ? (
            <button
              type="button"
              className="min-w-0 rounded-sm break-words text-left hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() =>
                openMilestoneDetails(projectId, group.milestone!.id)
              }
            >
              {group.milestone.title}
            </button>
          ) : (
            <span>{t("tasks:milestones.none")}</span>
          )}
          {group.milestone?.status && (
            <span className="truncate font-normal text-muted-foreground">
              {columns.get(group.milestone.status)?.name ??
                t("tasks:status.planned")}
            </span>
          )}
        </h4>
        <ReleaseWorkProgress progress={progress} ready={progressReady} />
      </div>
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
            nested
          />
        ))}
      </ul>
    </section>
  );
}
