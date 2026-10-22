import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useGetProjectMilestones } from "@/hooks/queries/milestone/use-get-project-milestones";
import useGetProjectMembers from "@/hooks/queries/workspace-users/use-get-project-members";
import { HttpError } from "@/lib/http-error";
import type { ReleaseItemCounts } from "@/lib/releases/release-progress";
import { releasePhase } from "@/lib/releases/release-phase";
import type { Release } from "@/types/release";
import { releaseTimelineOrder } from "../list/release-timeline";
import type { ReleasePermissions } from "../use-release-permissions";
import { groupMasterplanningMilestones } from "./masterplanning-groups";
import { MasterplanningMilestoneRow } from "./masterplanning-milestone-row";
import { MasterplanningReleaseGroup } from "./masterplanning-release-group";
import { useMoveMasterplanningMilestone } from "./use-move-masterplanning-milestone";
import { CreateMasterplanningMilestoneDialog } from "./create-masterplanning-milestone-dialog";

export function ReleaseMasterplanning({
  releases,
  counts,
  today,
  workspaceId,
  projectId,
  permissions,
  onEdit,
  onDelete,
  onMoveUnfinished,
}: {
  releases: readonly Release[];
  counts: ReadonlyMap<string, ReleaseItemCounts>;
  today: string;
  workspaceId: string;
  projectId: string;
  permissions: ReleasePermissions;
  onEdit: (release: Release) => void;
  onDelete: (release: Release) => void;
  onMoveUnfinished: (release: Release) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const query = useGetProjectMilestones(projectId);
  const refetchMilestones = query.refetch;
  const movement = useMoveMasterplanningMilestone(projectId, query.data);
  const { groups, unresolved } = groupMasterplanningMilestones(
    releases,
    movement.milestones,
  );
  const members = useGetProjectMembers({
    workspaceId,
    projectId,
    enabled: Boolean(query.data?.some((milestone) => milestone.leadId)),
  });
  const leadNames = new Map(
    members.data?.map((member) => [member.id, member.name]),
  );
  const forbidden =
    query.error instanceof HttpError && query.error.status === 403;
  const ready = Boolean(query.data) && !forbidden;
  const canMove = permissions.canMoveItems && ready;
  const items = releaseTimelineOrder(releases, today);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 8 },
    }),
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ releaseId: string | null } | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState("");
  const [focusRequest, setFocusRequest] = useState<{ id: string } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLLIElement>(null);
  const positionedRef = useRef(false);
  const reconciledRef = useRef("");
  const unresolvedKey = unresolved
    .map((milestone) => `${milestone.id}:${milestone.releaseId}`)
    .join("|");
  const firstActiveId = items.find((release) => {
    const phase = releasePhase(release, today);
    return phase === "inProgress" || phase === "codeFreeze";
  })?.id;

  useEffect(() => {
    if (!ready || !unresolvedKey || reconciledRef.current === unresolvedKey)
      return;
    // The two snapshots may straddle a release change. Reconcile once without
    // repeatedly polling genuinely unavailable metadata or changing membership.
    reconciledRef.current = unresolvedKey;
    void refetchMilestones();
    void client.invalidateQueries({ queryKey: ["releases", projectId] });
  }, [client, projectId, refetchMilestones, ready, unresolvedKey]);

  useLayoutEffect(() => {
    if (positionedRef.current || (!query.data && !query.isError)) return;
    positionedRef.current = true;
    const viewport = viewportRef.current;
    const row = activeRowRef.current;
    if (!viewport || !row) return;
    viewport.scrollTo({
      top:
        viewport.scrollTop +
        row.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top,
      behavior: "instant",
    });
  }, [firstActiveId, query.data, query.isError]);

  useLayoutEffect(() => {
    if (!focusRequest) return;
    document
      .getElementById(`masterplanning-milestone-${focusRequest.id}`)
      ?.focus();
    setFocusRequest(null);
  }, [focusRequest]);

  const move = async (
    id: string,
    releaseId: string | null,
    restoreFocus = false,
  ) => {
    const milestone = movement.milestones.find((item) => item.id === id);
    if (
      !canMove ||
      !milestone ||
      (releaseId !== null &&
        !releases.some((release) => release.id === releaseId))
    )
      return;
    if (restoreFocus) setFocusRequest({ id });
    if (await movement.move(id, releaseId)) {
      setAnnouncement(
        t("tasks:releases.masterplanning.moved", {
          title: milestone.title,
          release:
            releases.find((release) => release.id === releaseId)?.name ??
            t("tasks:releases.none"),
        }),
      );
    } else if (
      restoreFocus &&
      (document.activeElement === document.body ||
        document.activeElement?.id === `masterplanning-milestone-${id}`)
    ) {
      setFocusRequest({ id });
    }
  };
  const drop = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over || typeof active.id !== "string") return;
    const target = over.data.current?.releaseId;
    if (target !== null && typeof target !== "string") return;
    void move(active.id, target);
  };
  const retryMetadata = () => {
    void query.refetch();
    void client.invalidateQueries({ queryKey: ["releases", projectId] });
  };
  const renderMilestones = (milestones: typeof movement.milestones) => (
    <ul>
      {milestones.map((milestone) => (
        <MasterplanningMilestoneRow
          key={milestone.id}
          milestone={milestone}
          workspaceId={workspaceId}
          projectId={projectId}
          leadName={
            milestone.leadId ? leadNames.get(milestone.leadId) : undefined
          }
          releases={items}
          canMove={canMove}
          pending={movement.pendingIds.has(milestone.id)}
          failed={movement.failures.has(milestone.id)}
          retryDisabled={Boolean(
            movement.failures.get(milestone.id)?.releaseId &&
            !releases.some(
              (release) =>
                release.id === movement.failures.get(milestone.id)?.releaseId,
            ),
          )}
          onMove={(releaseId) => void move(milestone.id, releaseId, true)}
          onRetry={() => {
            const failure = movement.failures.get(milestone.id);
            if (failure) void move(milestone.id, failure.releaseId, true);
          }}
        />
      ))}
    </ul>
  );
  const dragged = dragging
    ? movement.milestones.find((milestone) => milestone.id === dragging)
    : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active }) => setDragging(String(active.id))}
      onDragCancel={() => setDragging(null)}
      onDragEnd={drop}
    >
      <div ref={viewportRef} className="relative h-full overflow-y-auto">
        <div className="sr-only" role="status">
          {announcement}
        </div>
        {canMove && (
          <p className="px-3 py-3 text-xs text-muted-foreground sm:px-6">
            {t("tasks:releases.masterplanning.dragHelp")}
          </p>
        )}
        {!query.data && !query.isError && (
          <p
            role="status"
            className="px-3 py-4 text-sm text-muted-foreground sm:px-6"
          >
            {t("tasks:milestones.loading")}
          </p>
        )}
        {query.isError && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 px-3 py-4 text-sm text-muted-foreground sm:px-6"
          >
            <span>
              {t(
                forbidden
                  ? "tasks:releases.masterplanning.noAccess"
                  : "tasks:releases.masterplanning.loadError",
              )}
            </span>
            <Button
              variant="outline"
              size="xs"
              disabled={query.isFetching}
              onClick={retryMetadata}
            >
              {t("tasks:releases.retry")}
            </Button>
          </div>
        )}
        {members.isError && ready && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-muted-foreground sm:px-6"
          >
            <span>{t("tasks:releases.masterplanning.membersError")}</span>
            <Button
              variant="ghost"
              size="xs"
              disabled={members.isFetching}
              onClick={() => void members.refetch()}
            >
              {t("tasks:releases.retry")}
            </Button>
          </div>
        )}
        <ul
          aria-label={t("tasks:releases.masterplanning.label")}
          className="min-w-0"
        >
          {items.map((release) => {
            const milestones = groups.get(release.id) ?? [];
            return (
              <MasterplanningReleaseGroup
                key={release.id}
                ref={release.id === firstActiveId ? activeRowRef : undefined}
                release={release}
                count={milestones.length}
                counts={counts.get(release.id)}
                today={today}
                workspaceId={workspaceId}
                permissions={{ ...permissions, canMoveItems: canMove }}
                ready={ready}
                onEdit={onEdit}
                onDelete={onDelete}
                onMoveUnfinished={onMoveUnfinished}
                onCreateMilestone={
                  canMove
                    ? () => setCreating({ releaseId: release.id })
                    : undefined
                }
              >
                {ready && milestones.length > 0 && renderMilestones(milestones)}
              </MasterplanningReleaseGroup>
            );
          })}
          <MasterplanningReleaseGroup
            release={null}
            count={groups.get(null)?.length ?? 0}
            today={today}
            workspaceId={workspaceId}
            permissions={{ ...permissions, canMoveItems: canMove }}
            ready={ready}
            onEdit={onEdit}
            onDelete={onDelete}
            onMoveUnfinished={onMoveUnfinished}
            onCreateMilestone={
              canMove ? () => setCreating({ releaseId: null }) : undefined
            }
          >
            {ready &&
              Boolean(groups.get(null)?.length) &&
              renderMilestones(groups.get(null)!)}
          </MasterplanningReleaseGroup>
        </ul>
        {ready && unresolved.length > 0 && (
          <section
            aria-label={t("tasks:releases.masterplanning.unresolvedTitle")}
            className="border-t border-border px-3 py-4 sm:px-6"
          >
            <div
              role="alert"
              className="flex flex-wrap items-center gap-2 pb-2 text-sm text-muted-foreground"
            >
              <span>{t("tasks:releases.masterplanning.unresolved")}</span>
              <Button
                variant="outline"
                size="xs"
                disabled={query.isFetching}
                onClick={retryMetadata}
              >
                {t("tasks:releases.retry")}
              </Button>
            </div>
            {renderMilestones(unresolved)}
          </section>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragged && (
          <div className="max-w-80 truncate rounded-md border border-border bg-popover px-4 py-3 text-sm shadow-md">
            {dragged.title}
            <div className="truncate text-xs text-muted-foreground">
              {dragged.featureTitle}
            </div>
          </div>
        )}
      </DragOverlay>
      {creating && (
        <CreateMasterplanningMilestoneDialog
          projectId={projectId}
          initialReleaseId={creating.releaseId}
          onClose={() => setCreating(null)}
        />
      )}
    </DndContext>
  );
}
