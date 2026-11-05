import { ChevronRight, Diamond } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatReleaseDate } from "@/lib/releases/release-date";
import type { Release } from "@/types/release";
import type {
  ReleasePlanChanges,
  ReleasePlanPreview,
  ReleasePlanTask,
} from "@/types/release-plan";
import { lateTaskIds } from "../release-plan-changes";
import { AdjustReleaseDatesDialog } from "./adjust-release-dates-dialog";
import { ConflictTaskRow } from "./conflict-task-row";
import { MoveWorkDialog } from "./move-work-dialog";
import { releaseWorkGroups } from "./resolution-model";
import { StagedReleaseMoves } from "./staged-release-moves";

export function ReleasePlanResolution({
  preview,
  release,
  releases,
  tasks,
  currentTasks,
  changes,
  pending,
  canPlan,
  applied = false,
  onChange,
  onFocusTask,
  onOpenTask,
  taskHref,
}: {
  preview: ReleasePlanPreview;
  release: Release;
  releases: Release[];
  tasks: ReleasePlanTask[];
  currentTasks?: ReleasePlanTask[];
  changes: ReleasePlanChanges;
  pending: boolean;
  canPlan: boolean;
  applied?: boolean;
  onChange: (changes: ReleasePlanChanges) => void;
  onFocusTask?: (taskId: string) => void;
  onOpenTask?: (taskId: string) => void;
  taskHref?: (taskId: string) => string;
}) {
  const { t } = useTranslation();
  const groups = releaseWorkGroups(preview.tasks);
  const late = lateTaskIds(preview);
  const byId = new Map(
    [...preview.tasks, ...tasks].map((task) => [task.taskId, task]),
  );
  const milestoneWork = new Map<
    string,
    { releaseId: string | null; taskIds: string[] }
  >();
  for (const task of currentTasks ?? byId.values()) {
    if (!task.milestoneId || task.completed || task.reason === "archived")
      continue;
    const work = milestoneWork.get(task.milestoneId) ?? {
      releaseId: task.milestoneReleaseId ?? null,
      taskIds: [],
    };
    work.taskIds.push(task.taskId);
    milestoneWork.set(task.milestoneId, work);
  }
  const disabled = pending || !canPlan;
  const moveDialogProps = { preview, release, releases, changes, onChange };
  return (
    <section
      className="flex min-w-0 flex-col gap-4 p-4"
      aria-label={t("tasks:gantt.taskHeader")}
    >
      <div className="space-y-3">
        <h3 className="text-sm font-medium">{t("tasks:gantt.taskHeader")}</h3>
        {late.size > 0 && (
          <div className="flex flex-wrap gap-2">
            <AdjustReleaseDatesDialog
              release={release}
              preview={preview}
              changes={changes}
              disabled={disabled}
              onChange={onChange}
            />
            <MoveWorkDialog
              {...moveDialogProps}
              selection={{
                kind: "late",
                taskIds: [...late],
              }}
              disabled={disabled}
            />
          </div>
        )}
      </div>
      {groups.map((group) => {
        const title = group.title ?? t("tasks:milestones.none");
        const work = group.id ? milestoneWork.get(group.id) : undefined;
        const groupHasLateWork = group.tasks.some(({ taskId }) =>
          late.has(taskId),
        );
        return (
          <section
            key={group.id ?? "no-milestone"}
            className="min-w-0 overflow-hidden rounded-md border"
            aria-label={title}
          >
            <Collapsible defaultOpen>
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b bg-muted/45 px-3 py-2">
                <h4 className="min-w-0 flex-auto text-sm font-medium">
                  {group.id ? (
                    <CollapsibleTrigger
                      type="button"
                      aria-label={
                        group.featureTitle
                          ? `${title} (${group.featureTitle})`
                          : title
                      }
                      className="flex w-full min-w-0 items-center gap-2 rounded-sm text-left outline-none hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring data-panel-open:[&>svg:first-child]:rotate-90"
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                      <Diamond
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <span className="min-w-0 break-words" title={title}>
                          {title}
                        </span>
                        {group.featureTitle && (
                          <span
                            className="min-w-0 truncate text-xs font-normal text-muted-foreground"
                            title={group.featureTitle}
                          >
                            {group.featureTitle}
                          </span>
                        )}
                      </span>
                    </CollapsibleTrigger>
                  ) : (
                    title
                  )}
                </h4>
                {group.id && work && groupHasLateWork && (
                  <MoveWorkDialog
                    {...moveDialogProps}
                    selection={{
                      kind: "milestone",
                      milestoneId: group.id,
                      title,
                      taskIds: work.taskIds,
                      moveMilestone:
                        work.releaseId === null ||
                        work.releaseId === release.id,
                    }}
                    disabled={disabled}
                  />
                )}
              </div>
              <CollapsiblePanel className="motion-reduce:transition-none">
                <ul className="divide-y px-3 py-2">
                  {group.tasks.map((task) => (
                    <ConflictTaskRow
                      key={task.taskId}
                      task={task}
                      late={late.has(task.taskId)}
                      timeZone={preview.timeZone}
                      showFeature={!group.id}
                      onFocusTask={onFocusTask}
                      onOpenTask={onOpenTask}
                      taskHref={taskHref?.(task.taskId)}
                    >
                      {late.has(task.taskId) && (
                        <MoveWorkDialog
                          {...moveDialogProps}
                          selection={{ kind: "task", task }}
                          disabled={disabled}
                        />
                      )}
                    </ConflictTaskRow>
                  ))}
                </ul>
              </CollapsiblePanel>
            </Collapsible>
          </section>
        );
      })}
      {changes.releaseDates && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
          <span>
            {t(
              applied
                ? "tasks:releases.planning.resolution.savedDates"
                : "tasks:releases.planning.resolution.stagedDates",
              {
                codeFreeze: formatReleaseDate(
                  changes.releaseDates.codeFreezeDate,
                ),
                submission: formatReleaseDate(
                  changes.releaseDates.submissionDate,
                ),
              },
            )}
          </span>
          {!applied && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                const { releaseDates: _dates, ...rest } = changes;
                onChange(rest);
              }}
            >
              {t("tasks:releases.planning.resolution.undo")}
            </Button>
          )}
        </div>
      )}
      <StagedReleaseMoves
        changes={changes}
        tasks={byId}
        releases={releases}
        disabled={disabled}
        applied={applied}
        onChange={onChange}
      />
    </section>
  );
}
