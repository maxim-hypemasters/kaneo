import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ReleaseItemCounts } from "@/lib/releases/release-progress";
import { releasePhase } from "@/lib/releases/release-phase";
import type { Release } from "@/types/release";
import { ReleaseActionsMenu } from "../release-actions-menu";
import { releaseCountdown } from "../release-countdown";
import { ReleaseCounts } from "../release-counts-text";
import { ReleaseDates } from "../release-dates";
import { ReleasePhaseBadge } from "../release-phase-badge";
import { ReleaseProgressBar } from "../release-progress-bar";
import type { ReleasePermissions } from "../use-release-permissions";

type ReleaseRowProps = {
  release: Release;
  counts: ReleaseItemCounts;
  today: string;
  workspaceId: string;
  permissions: ReleasePermissions;
  onEdit: (release: Release) => void;
  onDelete: (release: Release) => void;
  onMoveUnfinished: (release: Release) => void;
};

// One link covers the row; the actions menu and the dates sit above it.
export function ReleaseRow({
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
  const countdown = releaseCountdown(release, today);

  return (
    <li className="relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-border/60 border-b px-4 py-3 transition-colors hover:bg-accent/40 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(9rem,1fr)_2rem] md:items-center md:gap-x-6">
      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/dashboard/workspace/$workspaceId/project/$projectId/releases/$releaseId"
            params={{
              workspaceId,
              projectId: release.projectId,
              releaseId: release.id,
            }}
            className="truncate font-medium text-foreground text-sm outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
          >
            {release.name}
          </Link>
          <ReleasePhaseBadge phase={releasePhase(release, today)} />
        </div>
        <p className="truncate text-muted-foreground text-xs">
          {t(countdown.key, { count: countdown.count })}
        </p>
      </div>
      <div className="relative z-10 col-start-2 row-start-1 justify-self-end md:col-start-4">
        <ReleaseActionsMenu
          name={release.name}
          permissions={permissions}
          onEdit={() => onEdit(release)}
          onDelete={() => onDelete(release)}
          onMoveUnfinished={
            counts.unfinished > 0 ? () => onMoveUnfinished(release) : undefined
          }
        />
      </div>
      <ReleaseDates
        release={release}
        today={today}
        className="col-span-2 md:col-span-1 md:col-start-2 md:row-start-1"
        // Above the row's link so a mouse reaches each date's tooltip; a tap
        // still opens the release, as touch has no hover.
        itemClassName="relative z-10 pointer-coarse:pointer-events-none"
      />
      <div className="col-span-2 min-w-0 space-y-1 md:col-span-1 md:col-start-3 md:row-start-1">
        <ReleaseProgressBar
          completed={counts.completedTasks}
          total={counts.tasks}
        />
        <ReleaseCounts counts={counts} />
      </div>
    </li>
  );
}
