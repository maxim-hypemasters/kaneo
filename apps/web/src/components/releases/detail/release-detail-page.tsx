import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import CreateTaskModal from "@/components/shared/modals/create-task-modal";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Button } from "@/components/ui/button";
import { useGetReleases } from "@/hooks/queries/release/use-get-releases";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { getFeatureIndex } from "@/lib/features/feature-index";
import { finalStatuses } from "@/lib/releases/release-progress";
import { useReleaseToday } from "@/lib/releases/use-release-today";
import type { Release } from "@/types/release";
import { DeleteReleaseDialog } from "../delete-release-dialog";
import { ReleaseDialog } from "../dialog/release-dialog";
import { ReleasesLoadError } from "../list/releases-load-error";
import { MoveUnfinishedDialog } from "../move-unfinished-dialog";
import { useReleaseCounts } from "../use-release-counts";
import { useReleasePermissions } from "../use-release-permissions";
import { groupReleaseItems } from "./group-release-items";
import { ReleaseDetailEmpty } from "./release-detail-empty";
import { ReleaseDetailHeader } from "./release-detail-header";
import { ReleaseDetailSkeleton } from "./release-detail-skeleton";
import { ReleaseItemGroups } from "./release-item-groups";
import { ReleaseItemsSkeleton } from "./release-items-skeleton";
import { ReleaseNotFound } from "./release-not-found";

const NO_RELEASES: Release[] = [];

type ReleaseDetailPageProps = {
  workspaceId: string;
  projectId: string;
  releaseId: string;
  taskId: string | undefined;
  onCloseTask: () => void;
};

// A release and its items, built from the project's board.
export function ReleaseDetailPage({
  workspaceId,
  projectId,
  releaseId,
  taskId,
  onCloseTask,
}: ReleaseDetailPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const releasesQuery = useGetReleases(projectId);
  const boardQuery = useGetTasks(projectId);
  const board = boardQuery.data;
  const releases = releasesQuery.data ?? NO_RELEASES;
  // Kept on screen after deleting it here until the list opens, rather than
  // flashing "not found".
  const [deleted, setDeleted] = useState<Release | null>(null);
  const release =
    releases.find((item) => item.id === releaseId) ??
    (deleted?.id === releaseId ? deleted : undefined);
  const today = useReleaseToday();
  const permissions = useReleasePermissions();
  const shown = useMemo(() => (release ? [release] : NO_RELEASES), [release]);
  const counts = useReleaseCounts(projectId, shown).get(releaseId);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);

  const done = useMemo(
    () => finalStatuses(board?.columns ?? []),
    [board?.columns],
  );
  const columns = useMemo(
    () =>
      new Map((board?.columns ?? []).map((column) => [column.slug, column])),
    [board?.columns],
  );
  const groups = useMemo(
    () =>
      board
        ? groupReleaseItems(board, releaseId, getFeatureIndex(board), done)
        : null,
    [board, releaseId, done],
  );
  const openAddTask = permissions.canCreateTasks
    ? () => setAddTaskOpen(true)
    : undefined;

  let content = <ReleaseDetailSkeleton />;
  if (release && counts) {
    let items = <ReleaseItemsSkeleton />;
    if (groups && groups.features.length + groups.standalone.length > 0) {
      items = (
        <ReleaseItemGroups
          groups={groups}
          workspaceId={workspaceId}
          releaseId={releaseId}
          projectSlug={board?.slug}
          columns={columns}
          done={done}
        />
      );
    } else if (groups && !boardQuery.isPending) {
      items = <ReleaseDetailEmpty onAddTask={openAddTask} />;
    } else if (boardQuery.isError) {
      items = (
        <ReleasesLoadError
          message={t("tasks:releases.pages.tasksLoadError")}
          retrying={boardQuery.isFetching}
          onRetry={() => void boardQuery.refetch()}
        />
      );
    }
    content = (
      <div className="h-full overflow-y-auto">
        <ReleaseDetailHeader
          release={release}
          counts={counts}
          today={today}
          workspaceId={workspaceId}
          permissions={permissions}
          onEdit={() => setFormOpen(true)}
          onDelete={() => setDeleteOpen(true)}
          onMoveUnfinished={() => setMoveOpen(true)}
        />
        {items}
      </div>
    );
  } else if (releasesQuery.data) {
    content = (
      <ReleaseNotFound workspaceId={workspaceId} projectId={projectId} />
    );
  } else if (releasesQuery.isError) {
    content = (
      <ReleasesLoadError
        message={t("tasks:releases.loadError")}
        retrying={releasesQuery.isFetching}
        onRetry={() => void releasesQuery.refetch()}
      />
    );
  }

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="releases"
      toolbar={
        release && openAddTask ? (
          <Button variant="outline" size="xs" onClick={openAddTask}>
            <Plus aria-hidden="true" />
            {t("tasks:releases.detail.addTask")}
          </Button>
        ) : null
      }
    >
      <PageTitle
        title={t("tasks:releases.pageTitle", {
          name: release?.name ?? board?.name ?? "",
        })}
      />
      <div className="h-full min-h-0 bg-card">{content}</div>

      {release ? (
        <>
          <ReleaseDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            projectId={projectId}
            release={release}
          />
          <DeleteReleaseDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            release={release}
            itemCount={counts ? counts.tasks + counts.features : 0}
            onDeleted={() => {
              setDeleted(release);
              navigate({
                to: "/dashboard/workspace/$workspaceId/project/$projectId/releases",
                params: { workspaceId, projectId },
                replace: true,
              });
            }}
          />
          <MoveUnfinishedDialog
            open={moveOpen}
            onOpenChange={setMoveOpen}
            release={release}
            releases={releases}
            unfinished={counts?.unfinished ?? 0}
            today={today}
          />
          <CreateTaskModal
            open={addTaskOpen}
            projectId={projectId}
            releaseId={release.id}
            onClose={() => setAddTaskOpen(false)}
          />
        </>
      ) : null}

      <TaskDetailsSheet
        taskId={taskId}
        projectId={projectId}
        workspaceId={workspaceId}
        onClose={onCloseTask}
      />
    </ProjectLayout>
  );
}
