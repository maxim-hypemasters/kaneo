import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getStatusDisplayLabel } from "@/lib/i18n/domain";
import { openMilestoneDetails } from "@/store/milestone-details";
import { cn } from "@/lib/cn";
import { type ReleaseItemColumn, ReleaseItemRow } from "./release-item-row";
import {
  getReleaseWorkProgress,
  type ReleaseMilestoneGroup,
} from "./release-milestone-groups";
import { ReleaseWorkProgress } from "./release-work-progress";
import { ReleaseMilestoneProgressIcon } from "./release-milestone-progress-icon";

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
  const [expanded, setExpanded] = useState(false);
  const completed = group.milestone?.status === "done";
  const progress = getReleaseWorkProgress(group.tasks, done, started);
  return (
    <section aria-labelledby={titleId}>
      <Collapsible
        open={!group.milestone || expanded}
        onOpenChange={setExpanded}
      >
        <div className="relative flex min-h-9 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-border/50 border-b bg-muted/15 py-2 pr-4 pl-7 sm:pl-9">
          {group.milestone && (
            <CollapsibleTrigger
              type="button"
              aria-label={`${t(expanded ? "tasks:gantt.hideTasks" : "tasks:gantt.showTasks")}: ${group.milestone.title}`}
              className="touch-hitbox absolute top-1/2 left-1 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:left-3"
            >
              <ChevronRight
                aria-hidden="true"
                className={cn("size-3.5", expanded && "rotate-90")}
              />
            </CollapsibleTrigger>
          )}
          <h4
            id={titleId}
            className="flex max-w-full min-w-0 items-center gap-2 text-xs font-medium"
          >
            <ReleaseMilestoneProgressIcon
              progress={progress}
              ready={progressReady}
              unassigned={!group.milestone}
            />
            {group.milestone ? (
              <button
                type="button"
                className={cn(
                  "min-w-0 rounded-sm break-words text-left hover:underline focus-visible:ring-2 focus-visible:ring-ring",
                  completed && "line-through",
                )}
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
              <span className="sr-only">
                {getStatusDisplayLabel(group.milestone.status)}
              </span>
            )}
          </h4>
          <ReleaseWorkProgress progress={progress} ready={progressReady} />
        </div>
        <CollapsiblePanel>
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
        </CollapsiblePanel>
      </Collapsible>
    </section>
  );
}
