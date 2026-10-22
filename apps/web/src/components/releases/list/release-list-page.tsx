import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import useGetProject from "@/hooks/queries/project/use-get-project";
import { useGetReleases } from "@/hooks/queries/release/use-get-releases";
import { useReleaseToday } from "@/lib/releases/use-release-today";
import { isReleaseView, type ReleaseView } from "@/lib/releases/release-view";
import type { Release } from "@/types/release";
import { DeleteReleaseDialog } from "../delete-release-dialog";
import { ReleaseDialog } from "../dialog/release-dialog";
import { MoveUnfinishedDialog } from "../move-unfinished-dialog";
import { ReleaseMasterplanning } from "../masterplanning/release-masterplanning";
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
  view?: ReleaseView;
  onViewChange?: (view: ReleaseView) => void;
};

export function ReleaseListPage({
  workspaceId,
  projectId,
  view = "overview",
  onViewChange,
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
    const sharedProps = {
      releases,
      counts,
      today,
      workspaceId,
      permissions,
      onEdit: (release: Release) => {
        setEditing(release);
        setFormOpen(true);
      },
      onDelete: (release: Release) => {
        setDeleting(release);
        setDeleteOpen(true);
      },
      onMoveUnfinished: (release: Release) => {
        setMoving(release);
        setMoveOpen(true);
      },
    };
    content =
      view === "masterplanning" ? (
        <ReleaseMasterplanning
          key={`${workspaceId}:${projectId}`}
          {...sharedProps}
          projectId={projectId}
        />
      ) : (
        <ReleaseList
          key={`${workspaceId}:${projectId}`}
          {...sharedProps}
          emptyState={
            <ReleaseListEmpty
              onCreate={permissions.canManage ? openCreate : undefined}
            />
          }
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
    <Tabs
      value={view}
      onValueChange={(value) => {
        if (isReleaseView(value)) onViewChange?.(value);
      }}
      className="contents"
    >
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
          <div className="flex min-w-0 items-center gap-3">
            <TabsList
              aria-label={t("tasks:releases.views.label")}
              className="shrink-0"
            >
              <TabsTab
                value="overview"
                className="h-7 px-2 text-xs sm:h-7 sm:text-xs"
              >
                {t("tasks:releases.views.overview")}
              </TabsTab>
              <TabsTab
                value="masterplanning"
                className="h-7 px-2 text-xs sm:h-7 sm:text-xs"
              >
                {t("tasks:releases.views.masterplanning")}
              </TabsTab>
            </TabsList>
            {releases && (
              <span className="hidden truncate text-muted-foreground text-xs tabular-nums sm:inline">
                {t("tasks:releases.count", { count: releases.length })}
              </span>
            )}
          </div>
        }
      >
        <PageTitle
          title={t("tasks:releases.pageTitle", { name: project?.name ?? "" })}
        />
        <TabsPanel value="overview" className="h-full min-h-0 bg-card">
          {view === "overview" ? content : null}
        </TabsPanel>
        <TabsPanel value="masterplanning" className="h-full min-h-0 bg-card">
          {view === "masterplanning" ? content : null}
        </TabsPanel>

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
    </Tabs>
  );
}
