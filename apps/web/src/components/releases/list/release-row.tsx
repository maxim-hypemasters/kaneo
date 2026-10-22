import { Link } from "@tanstack/react-router";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { SubtaskProgressGlyph } from "@/components/task-chips/subtask-progress-glyph";
import type { ReleaseItemCounts } from "@/lib/releases/release-progress";
import { releasePhase } from "@/lib/releases/release-phase";
import type { Release } from "@/types/release";
import { ReleaseActionsMenu } from "../release-actions-menu";
import { ReleaseProgressSection } from "../detail/release-progress-section";
import { ReleasePhaseBadge } from "../release-phase-badge";
import type { ReleasePermissions } from "../use-release-permissions";
import { ReleaseTimelineDate } from "./release-timeline-date";

type ReleaseRowProps = {
  ref?: Ref<HTMLLIElement>;
  release: Release;
  counts: ReleaseItemCounts;
  today: string;
  workspaceId: string;
  permissions: ReleasePermissions;
  onEdit: (release: Release) => void;
  onDelete: (release: Release) => void;
  onMoveUnfinished: (release: Release) => void;
};

export function ReleaseRow({
  ref,
  release,
  counts,
  today,
  workspaceId,
  permissions,
  onEdit,
  onDelete,
  onMoveUnfinished,
}: ReleaseRowProps) {
  const { t } = useTranslation();
  const phase = releasePhase(release, today);
  const active = phase === "inProgress" || phase === "codeFreeze";
  const percentage =
    counts.tasks > 0
      ? Math.round((counts.completedTasks / counts.tasks) * 100)
      : 0;

  return (
    <li
      ref={ref}
      className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] sm:grid-cols-[5.5rem_minmax(0,1fr)]"
    >
      <ReleaseTimelineDate
        date={release.submissionDate}
        today={today}
        phase={phase}
      />
      <div className="min-w-0 border-b border-border/60">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:gap-x-6">
          <Link
            to="/dashboard/workspace/$workspaceId/project/$projectId/releases/$releaseId"
            params={{
              workspaceId,
              projectId: release.projectId,
              releaseId: release.id,
            }}
            title={release.name}
            className="min-w-0 truncate rounded-sm font-medium text-foreground text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {release.name}
          </Link>
          <div className="col-start-2 row-start-1 justify-self-end lg:col-start-3">
            <ReleaseActionsMenu
              name={release.name}
              permissions={permissions}
              onEdit={() => onEdit(release)}
              onDelete={() => onDelete(release)}
              onMoveUnfinished={
                counts.unfinished > 0
                  ? () => onMoveUnfinished(release)
                  : undefined
              }
            />
          </div>
          <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:justify-end">
            <ReleasePhaseBadge phase={phase} />
            <span
              role="img"
              aria-label={t("tasks:releases.timeline.completion", {
                name: release.name,
                percentage,
                completed: counts.completedTasks,
                total: counts.tasks,
              })}
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-xs tabular-nums text-muted-foreground"
            >
              <span aria-hidden="true" className="size-3.5">
                <SubtaskProgressGlyph
                  completed={counts.completedTasks}
                  total={counts.tasks}
                />
              </span>
              <span aria-hidden="true">
                {percentage}% · {counts.completedTasks}/{counts.tasks}
              </span>
            </span>
          </div>
        </div>
        {active && (
          <div className="px-3 sm:px-6">
            <ReleaseProgressSection
              release={release}
              counts={counts}
              today={today}
              presentation="overview"
            />
          </div>
        )}
      </div>
    </li>
  );
}
