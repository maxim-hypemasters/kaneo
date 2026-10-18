import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRightLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { ReleaseItemCounts } from "@/lib/releases/release-progress";
import { releasePhase } from "@/lib/releases/release-phase";
import type { Release } from "@/types/release";
import { ReleaseActionsMenu } from "../release-actions-menu";
import { releaseCountdown } from "../release-countdown";
import { ReleaseCounts } from "../release-counts-text";
import { ReleasePhaseBadge } from "../release-phase-badge";
import { ReleaseProgressBar } from "../release-progress-bar";
import type { ReleasePermissions } from "../use-release-permissions";
import { ReleaseTimeline } from "./release-timeline";

type ReleaseDetailHeaderProps = {
  release: Release;
  counts: ReleaseItemCounts;
  today: string;
  workspaceId: string;
  permissions: ReleasePermissions;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUnfinished: () => void;
};

export function ReleaseDetailHeader({
  release,
  counts,
  today,
  workspaceId,
  permissions,
  onEdit,
  onDelete,
  onMoveUnfinished,
}: ReleaseDetailHeaderProps) {
  const { t } = useTranslation();
  const phase = releasePhase(release, today);
  const countdown = releaseCountdown(release, today);
  const canMove = permissions.canMoveItems && counts.unfinished > 0;
  // From code freeze on, leftovers are the release's main question.
  const moveProminent =
    canMove && (phase === "codeFreeze" || phase === "pastSubmission");

  return (
    <header className="space-y-5 border-border/80 border-b px-4 py-5 sm:px-6">
      <Link
        to="/dashboard/workspace/$workspaceId/project/$projectId/releases"
        params={{ workspaceId, projectId: release.projectId }}
        className="touch-hitbox relative inline-flex items-center gap-1 rounded-sm text-muted-foreground text-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        {t("tasks:releases.detail.back")}
      </Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="min-w-0 break-words font-heading font-semibold text-xl">
              {release.name}
            </h1>
            <ReleasePhaseBadge phase={phase} />
          </div>
          <p className="text-muted-foreground text-sm">
            {t(countdown.key, { count: countdown.count })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {moveProminent ? (
            <Button variant="outline" size="sm" onClick={onMoveUnfinished}>
              <ArrowRightLeft aria-hidden="true" />
              {t("tasks:releases.moveUnfinished.action")}
            </Button>
          ) : null}
          <ReleaseActionsMenu
            name={release.name}
            permissions={permissions}
            onEdit={onEdit}
            onDelete={onDelete}
            onMoveUnfinished={
              canMove && !moveProminent ? onMoveUnfinished : undefined
            }
          />
        </div>
      </div>
      {release.description ? (
        <p className="max-w-prose whitespace-pre-wrap break-words text-foreground/85 text-sm">
          {release.description}
        </p>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(14rem,1fr)] lg:items-end lg:gap-10">
        <ReleaseTimeline release={release} today={today} />
        <div className="space-y-1.5">
          <ReleaseProgressBar
            completed={counts.completedTasks}
            total={counts.tasks}
          />
          <ReleaseCounts counts={counts} />
        </div>
      </div>
    </header>
  );
}
