import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import useGetProject from "@/hooks/queries/project/use-get-project";
import { useGetReleases } from "@/hooks/queries/release/use-get-releases";
import { useReleaseToday } from "@/lib/releases/use-release-today";
import type { Release } from "@/types/release";
import { DeleteReleaseDialog } from "../delete-release-dialog";
import { ReleaseDialog } from "../dialog/release-dialog";
import { MoveUnfinishedDialog } from "../move-unfinished-dialog";
import { useReleaseCounts } from "../use-release-counts";
import { useReleasePermissions } from "../use-release-permissions";
import { ReleaseList } from "./release-list";
import { ReleaseListEmpty } from "./release-list-empty";
import { ReleaseListSkeleton } from "./release-list-skeleton";
import { ReleasesLoadError } from "./releases-load-error";

const NO_RELEASES: Release[] = [];

type ReleaseListPageProps = {
  workspaceId: string;
  projectId: string;
};

export function ReleaseListPage({
  workspaceId,
  projectId,
}: ReleaseListPageProps) {
  const { t } = useTranslation();
  const { data: project } = useGetProject({ id: projectId, workspaceId });
  const {
    data: releases,
    isError,
    isFetching,
    refetch,
  } = useGetReleases(projectId);
  const today = useReleaseToday();
  const permissions = useReleasePermissions();
  const counts = useReleaseCounts(projectId, releases ?? NO_RELEASES);
  // Each dialog keeps its release after closing, for the exit animation.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Release | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Release | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moving, setMoving] = useState<Release | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const deletingCounts = deleting ? counts.get(deleting.id) : undefined;
  const movingCounts = moving ? counts.get(moving.id) : undefined;

  let content = <ReleaseListSkeleton />;
  if (releases) {
    content = (
      <ReleaseList
        key={`${workspaceId}:${projectId}`}
        releases={releases}
        counts={counts}
        today={today}
        workspaceId={workspaceId}
        permissions={permissions}
        emptyState={
          <ReleaseListEmpty
            onCreate={permissions.canManage ? openCreate : undefined}
          />
        }
        onEdit={(release) => {
          setEditing(release);
          setFormOpen(true);
        }}
        onDelete={(release) => {
          setDeleting(release);
          setDeleteOpen(true);
        }}
        onMoveUnfinished={(release) => {
          setMoving(release);
          setMoveOpen(true);
        }}
      />
    );
  } else if (isError) {
    content = (
      <ReleasesLoadError
        message={t("tasks:releases.loadError")}
        retrying={isFetching}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="releases"
      toolbar={
        permissions.canManage ? (
          <Button variant="outline" size="xs" onClick={openCreate}>
            <Plus aria-hidden="true" />
            {t("tasks:releases.new")}
          </Button>
        ) : null
      }
      summary={
        releases ? (
          <span className="hidden truncate text-muted-foreground text-xs tabular-nums sm:inline">
            {t("tasks:releases.count", { count: releases.length })}
          </span>
        ) : null
      }
    >
      <PageTitle
        title={t("tasks:releases.pageTitle", { name: project?.name ?? "" })}
      />
      <div className="h-full min-h-0 bg-card">{content}</div>

      <ReleaseDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        projectId={projectId}
        release={editing}
      />
      <DeleteReleaseDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        release={deleting}
        itemCount={
          deletingCounts
            ? deletingCounts.tasks + (deletingCounts.milestones ?? 0)
            : 0
        }
      />
      {moving ? (
        <MoveUnfinishedDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          release={moving}
          releases={releases ?? NO_RELEASES}
          unfinished={movingCounts?.unfinished ?? 0}
          today={today}
        />
      ) : null}
    </ProjectLayout>
  );
}
