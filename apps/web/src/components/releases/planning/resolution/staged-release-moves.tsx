import { Diamond } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { Release } from "@/types/release";
import type { ReleasePlanChanges, ReleasePlanTask } from "@/types/release-plan";
import { undoMilestoneMove, undoMove } from "./resolution-model";
import { ResolutionTaskLabel } from "./resolution-task-label";

export function StagedReleaseMoves({
  changes,
  tasks,
  releases,
  disabled,
  applied,
  onChange,
}: {
  changes: ReleasePlanChanges;
  tasks: ReadonlyMap<string, ReleasePlanTask>;
  releases: Release[];
  disabled: boolean;
  applied: boolean;
  onChange: (changes: ReleasePlanChanges) => void;
}) {
  const { t } = useTranslation();
  if (!changes.moves?.length && !changes.milestoneMoves?.length) return null;
  const titles = new Map<string, string>();
  for (const task of tasks.values()) {
    if (task.milestoneId && task.milestoneTitle)
      titles.set(task.milestoneId, task.milestoneTitle);
  }
  const destinations = new Map(releases.map(({ id, name }) => [id, name]));
  const rows = [
    ...(changes.milestoneMoves ?? []).map(({ milestoneId, target }) => ({
      id: milestoneId,
      title: titles.get(milestoneId) ?? milestoneId,
      milestone: true,
      task: undefined,
      target,
    })),
    ...(changes.moves ?? []).map(({ taskId, target }) => ({
      id: taskId,
      title: tasks.get(taskId)?.title ?? taskId,
      milestone: false,
      task: tasks.get(taskId),
      target,
    })),
  ];
  const heading = t(
    applied
      ? "tasks:releases.planning.resolution.savedMoves"
      : "tasks:releases.planning.resolution.stagedMoves",
  );
  return (
    <section className="space-y-3 border-t pt-3" aria-label={heading}>
      <h3 className="text-sm font-medium">{heading}</h3>
      <p className="text-xs text-muted-foreground">
        {t(
          applied
            ? "tasks:releases.planning.resolution.savedPlacement"
            : "tasks:releases.planning.resolution.clearsPlacement",
        )}
      </p>
      <ul className="divide-y">
        {rows.map(({ id, title, milestone, task, target }) => {
          const destination =
            "releaseId" in target
              ? destinations.get(target.releaseId)
              : changes.newRelease?.name;
          return (
            <li
              key={`${milestone ? "milestone" : "task"}:${id}`}
              className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 space-y-1">
                {task ? (
                  <ResolutionTaskLabel task={task} />
                ) : (
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    {milestone && (
                      <Diamond
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                    )}
                    <span className="break-words">{title}</span>
                  </div>
                )}
                <p
                  className="truncate text-xs text-muted-foreground"
                  title={destination}
                >
                  {destination
                    ? t("tasks:releases.planning.resolution.destination", {
                        release: destination,
                      })
                    : t(
                        "tasks:releases.planning.resolution.destinationUnavailable",
                      )}
                </p>
              </div>
              {!applied && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={disabled}
                  aria-label={t("tasks:releases.planning.resolution.undoMove", {
                    title,
                  })}
                  onClick={() =>
                    onChange(
                      milestone
                        ? undoMilestoneMove(changes, id)
                        : undoMove(changes, id),
                    )
                  }
                >
                  {t("tasks:releases.planning.resolution.undo")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
