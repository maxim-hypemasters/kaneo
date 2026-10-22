import { useDraggable } from "@dnd-kit/core";
import { Link } from "@tanstack/react-router";
import { GripVertical, Loader2, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { milestoneDateLabel } from "@/components/task/milestones/milestone-date-label";
import { Button } from "@/components/ui/button";
import type { MilestoneWithFeature } from "@/fetchers/milestone/milestones";
import { cn } from "@/lib/cn";
import { getPriorityLabel, getStatusDisplayLabel } from "@/lib/i18n/domain";
import { getPriorityIcon } from "@/lib/priority";
import { openMilestoneDetails } from "@/store/milestone-details";
import type { Release } from "@/types/release";
import { ReleaseMilestoneProgressIcon } from "../detail/release-milestone-progress-icon";
import { MasterplanningMoveMenu } from "./masterplanning-move-menu";

export function MasterplanningMilestoneRow({
  milestone,
  workspaceId,
  projectId,
  leadName,
  releases,
  canMove,
  pending,
  failed,
  retryDisabled = false,
  onMove,
  onRetry,
}: {
  milestone: MilestoneWithFeature;
  workspaceId: string;
  projectId: string;
  leadName?: string;
  releases: readonly Release[];
  canMove: boolean;
  pending: boolean;
  failed: boolean;
  retryDisabled?: boolean;
  onMove: (releaseId: string | null) => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useDraggable({
      id: milestone.id,
      data: { milestoneId: milestone.id },
      disabled: !canMove || pending,
    });
  const dates = milestoneDateLabel(milestone, t);
  const { total, completed } = milestone.progress;
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  const lead =
    leadName ??
    t(
      milestone.leadId
        ? "common:people.unknown"
        : "tasks:popover.assignee.unassigned",
    );

  return (
    <li
      ref={setNodeRef}
      data-milestone-id={milestone.id}
      aria-busy={pending || undefined}
      className={cn(
        "min-w-0 border-t border-border/40 px-2 py-3 sm:px-5",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex min-w-0 items-start gap-1.5">
        {canMove && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            tabIndex={-1}
            aria-hidden="true"
            title={t("tasks:releases.masterplanning.dragMilestone", {
              title: milestone.title,
            })}
            disabled={pending}
            className="mt-0.5 flex size-6 shrink-0 touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:cursor-wait"
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <ReleaseMilestoneProgressIcon
              progress={milestone.progress}
              ready
              unassigned={false}
            />
            <button
              id={`masterplanning-milestone-${milestone.id}`}
              type="button"
              className={cn(
                "min-w-0 max-w-full truncate rounded-sm text-left text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring",
                milestone.status === "done" && "line-through",
              )}
              title={milestone.title}
              onClick={() => openMilestoneDetails(projectId, milestone.id)}
            >
              {milestone.title}
            </button>
            <span className="sr-only">
              {getStatusDisplayLabel(milestone.status ?? "to-do")}
            </span>
            <span
              role="img"
              className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground"
              aria-label={t("tasks:releases.masterplanning.progress", {
                percentage,
                completed,
                total,
              })}
            >
              <span aria-hidden="true">
                {percentage}% · {completed}/{total}
              </span>
            </span>
            {pending && (
              <Loader2
                aria-label={t("tasks:releases.masterplanning.moving")}
                className="size-3 animate-spin text-muted-foreground"
              />
            )}
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Link
              to="/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId"
              params={{ workspaceId, projectId, taskId: milestone.featureId }}
              search={
                milestone.releaseId
                  ? { originReleaseId: milestone.releaseId }
                  : {}
              }
              title={milestone.featureTitle}
              className="max-w-full truncate rounded-sm outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:max-w-64"
            >
              {milestone.featureTitle}
            </Link>
            <span
              className="inline-flex max-w-full min-w-0 items-center gap-1"
              title={`${t("tasks:milestones.lead")}: ${lead}`}
            >
              <UserRound aria-hidden="true" className="size-3 shrink-0" />
              <span className="sr-only">{t("tasks:milestones.lead")}: </span>
              <span className="truncate">{lead}</span>
            </span>
            <span
              className="inline-flex items-center gap-1"
              title={t("tasks:priority.label")}
            >
              {getPriorityIcon(milestone.priority ?? "no-priority")}
              <span className="sr-only">{t("tasks:priority.label")}: </span>
              {getPriorityLabel(milestone.priority ?? "no-priority")}
            </span>
            {dates && (
              <span
                title={[milestone.startDate, milestone.endDate]
                  .filter(Boolean)
                  .join(" – ")}
              >
                {dates}
              </span>
            )}
          </div>
        </div>
        {canMove && (
          <MasterplanningMoveMenu
            releases={releases}
            releaseId={milestone.releaseId}
            pending={pending}
            onMove={onMove}
          />
        )}
      </div>
      {failed && (
        <div
          role="alert"
          className="mt-2 flex flex-wrap items-center gap-2 text-xs text-destructive"
        >
          <span>{t("tasks:releases.masterplanning.moveError")}</span>
          {canMove && (
            <Button
              variant="ghost"
              size="xs"
              disabled={pending || retryDisabled}
              onClick={onRetry}
            >
              {t("tasks:releases.masterplanning.retryMove")}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
