import { useDroppable } from "@dnd-kit/core";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { ReleaseItemCounts } from "@/lib/releases/release-progress";
import { releasePhase } from "@/lib/releases/release-phase";
import type { Release } from "@/types/release";
import { ReleaseTimelineDate } from "../list/release-timeline-date";
import { ReleaseActionsMenu } from "../release-actions-menu";
import { ReleasePhaseBadge } from "../release-phase-badge";
import type { ReleasePermissions } from "../use-release-permissions";

export function MasterplanningReleaseGroup({
  ref,
  release,
  count,
  counts,
  today,
  workspaceId,
  permissions,
  ready,
  children,
  onEdit,
  onDelete,
  onMoveUnfinished,
  onCreateMilestone,
}: {
  ref?: Ref<HTMLLIElement>;
  release: Release | null;
  count: number;
  counts?: ReleaseItemCounts;
  today: string;
  workspaceId: string;
  permissions: ReleasePermissions;
  ready: boolean;
  children: ReactNode;
  onEdit: (release: Release) => void;
  onDelete: (release: Release) => void;
  onMoveUnfinished: (release: Release) => void;
  onCreateMilestone?: () => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({
    id: release?.id ?? "no-release",
    data: { releaseId: release?.id ?? null },
    disabled: !ready || !permissions.canMoveItems,
  });
  const phase = release ? releasePhase(release, today) : undefined;
  return (
    <li
      ref={ref}
      className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] sm:grid-cols-[5.5rem_minmax(0,1fr)]"
    >
      {release && phase ? (
        <ReleaseTimelineDate
          date={release.submissionDate}
          today={today}
          phase={phase}
        />
      ) : (
        <div aria-hidden="true" className="border-r border-border/70" />
      )}
      <section
        ref={setNodeRef}
        aria-label={release?.name ?? t("tasks:releases.none")}
        className={cn(
          "min-w-0 border-b border-border/60 pb-2",
          isOver && "bg-accent/50 ring-1 ring-inset ring-ring",
        )}
      >
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          {release ? (
            <Link
              to="/dashboard/workspace/$workspaceId/project/$projectId/releases/$releaseId"
              params={{
                workspaceId,
                projectId: release.projectId,
                releaseId: release.id,
              }}
              className="col-start-1 row-start-1 min-w-0 truncate rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              title={release.name}
            >
              {release.name}
            </Link>
          ) : (
            <h2 className="col-start-1 row-start-1 min-w-0 text-sm font-medium">
              {t("tasks:releases.none")}
            </h2>
          )}
          <div
            className={
              release || onCreateMilestone
                ? "col-span-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 lg:col-span-1 lg:col-start-2 lg:row-start-1"
                : "col-start-2 row-start-1 text-right lg:col-start-3"
            }
          >
            {phase && <ReleasePhaseBadge phase={phase} />}
            {ready && (
              <span className="text-xs text-muted-foreground">
                {t("tasks:releases.counts.milestones", { count })}
              </span>
            )}
          </div>
          {(release || onCreateMilestone) && (
            <div className="col-start-2 row-start-1 flex items-center gap-1 justify-self-end lg:col-start-3">
              {onCreateMilestone && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  aria-label={t("tasks:milestones.add")}
                  title={t("tasks:milestones.add")}
                  onClick={onCreateMilestone}
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                  <span className="hidden sm:inline">
                    {t("tasks:milestones.add")}
                  </span>
                </Button>
              )}
              {release && (
                <ReleaseActionsMenu
                  name={release.name}
                  permissions={permissions}
                  onEdit={() => onEdit(release)}
                  onDelete={() => onDelete(release)}
                  onMoveUnfinished={
                    (counts?.unfinished ?? 0) > 0
                      ? () => onMoveUnfinished(release)
                      : undefined
                  }
                />
              )}
            </div>
          )}
        </div>
        {children}
        {ready && count === 0 && (
          <p className="px-3 py-4 text-xs text-muted-foreground sm:px-6">
            {t(
              release
                ? "tasks:releases.masterplanning.noMilestones"
                : "tasks:releases.masterplanning.noMilestonesUnassigned",
            )}
            {permissions.canMoveItems && (
              <span className="mt-1 block">
                {t("tasks:releases.masterplanning.dropHere")}
              </span>
            )}
          </p>
        )}
      </section>
    </li>
  );
}
