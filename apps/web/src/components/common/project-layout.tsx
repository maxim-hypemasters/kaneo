import { MilestoneDetailsSheet } from "@/components/task/milestones/milestone-details-sheet";
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import MobileProjectNav from "@/components/common/header/mobile-project-nav";
import ProjectCrumbSelect from "@/components/common/header/project-crumb-select";
import WorkspaceCrumbSelect from "@/components/common/header/workspace-crumb-select";
import Layout from "@/components/common/layout";
import { ProjectScopeToggle } from "@/components/project/views/project-scope-toggle";
import {
  isTaskLayoutView,
  PROJECT_ROUTE_PATHS,
  type ProjectRoute,
  resolveProjectView,
} from "@/components/project/views/project-views";
import { useGoToProjectView } from "@/components/project/views/use-go-to-project-view";
import { useProjectViewShortcuts } from "@/components/project/views/use-project-view-shortcuts";
import CreateProjectModal from "@/components/shared/modals/create-project-modal";
import CreateTaskModal from "@/components/shared/modals/create-task-modal";
import { NewWorkMenu } from "@/components/shared/new-work-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import useGetProject from "@/hooks/queries/project/use-get-project";
import { useProjectWebSocket } from "@/hooks/use-project-websocket";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";
import { getProjectUnavailableReason } from "@/lib/project-unavailable-reason";
import { useBackgroundStore } from "@/store/background";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type { TaskType } from "@/types/task";
import ProjectUnavailable from "./project-unavailable";

type ProjectLayoutProps = {
  projectId: string;
  workspaceId: string;
  toolbar?: ReactNode;
  summary?: ReactNode;
  filterBar?: ReactNode;
  children: ReactNode;
  showViewSwitcher?: boolean;
  activeView?: ProjectRoute;
};

export default function ProjectLayout({
  projectId,
  workspaceId,
  toolbar,
  summary,
  filterBar,
  children,
  showViewSwitcher = true,
  activeView,
}: ProjectLayoutProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: project, error: projectError } = useGetProject({
    id: projectId,
    workspaceId,
  });
  const unavailableReason = getProjectUnavailableReason(projectError);
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] =
    useState(false);
  const [createType, setCreateType] = useState<TaskType | null>(null);
  const { canCreateTasks } = useWorkspacePermission();
  const { background } = useBackgroundStore();
  const viewMode = useUserPreferencesStore((state) => state.viewMode);

  useProjectWebSocket(unavailableReason ? "" : projectId);

  const resolvedRoute: ProjectRoute =
    activeView ??
    (location.pathname.includes("/backlog")
      ? "backlog"
      : location.pathname.includes("/features")
        ? "features"
        : location.pathname.includes("/releases")
          ? "releases"
          : location.pathname.includes("/calendar")
            ? "calendar"
            : location.pathname.includes("/gantt")
              ? "gantt"
              : "board");
  const currentView = resolveProjectView(resolvedRoute, viewMode);
  const showViews = showViewSwitcher && !unavailableReason;

  // "Tasks" on the backlog or releases returns to the task view shown last,
  // however it was reached: a deep link, the default project view, or the
  // layout switch.
  useEffect(() => {
    if (!isTaskLayoutView(currentView)) return;
    const { taskLayout, setTaskLayout } = useUserPreferencesStore.getState();
    if (taskLayout !== currentView) setTaskLayout(currentView);
  }, [currentView]);

  const goToView = useGoToProjectView({
    workspaceId,
    projectId,
    currentRoute: resolvedRoute,
  });
  useProjectViewShortcuts(goToView, currentView, showViews);

  const handleProjectSwitch = (nextProjectId: string) => {
    navigate({
      to: PROJECT_ROUTE_PATHS[resolvedRoute],
      params: {
        workspaceId,
        projectId: nextProjectId,
      },
    });
  };

  return (
    <Layout>
      <Layout.Header
        className={cn("h-11 border-border/80 px-2", {
          "bg-card/90 backdrop-blur": !!background,
        })}
      >
        <div className="flex w-full min-w-0 items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className="-ml-1 h-7 w-7 shrink-0 cursor-pointer text-foreground/85 hover:text-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="flex items-center gap-2 text-[10px]">
                  {t("navigation:settingsLayout.toggleSidebar")}
                  <ShortcutKeys id="toggleSidebar" />
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="h-4 w-px shrink-0 bg-border/80" />

          <div className="hidden min-w-0 items-center gap-1 md:flex">
            <WorkspaceCrumbSelect />
            <span className="text-foreground/30 text-xs">/</span>
            <ProjectCrumbSelect
              workspaceId={workspaceId}
              projectId={projectId}
              projectName={project?.name}
              onSelectProject={handleProjectSwitch}
              onAddProject={() => setIsCreateProjectModalOpen(true)}
            />
          </div>

          <div className="min-w-0 md:hidden">
            <MobileProjectNav
              workspaceId={workspaceId}
              projectId={projectId}
              projectName={project?.name}
              onSelectProject={handleProjectSwitch}
              onAddProject={() => setIsCreateProjectModalOpen(true)}
            />
          </div>
        </div>
      </Layout.Header>

      {unavailableReason ? null : (
        <TooltipProvider>
          <div
            className={cn(
              // On phones the toolbar takes a second row when it doesn't fit
              // beside the view links, rather than covering or clipping them.
              "flex min-h-11 shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-border/80 border-b px-2 py-1 sm:h-11 sm:flex-nowrap sm:px-3 sm:py-0",
              { "bg-card/80 backdrop-blur": !!background },
            )}
          >
            {showViewSwitcher && (
              <ProjectScopeToggle
                workspaceId={workspaceId}
                projectId={projectId}
                currentView={currentView}
                onSelect={goToView}
              />
            )}
            {summary}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {resolvedRoute !== "releases" && project && canCreateTasks() && (
                <NewWorkMenu onSelect={setCreateType} />
              )}
              {toolbar}
            </div>
          </div>
          <div className={cn({ "bg-card/80 backdrop-blur": !!background })}>
            {filterBar}
          </div>
        </TooltipProvider>
      )}

      <Layout.Content>
        {unavailableReason ? (
          <ProjectUnavailable
            reason={unavailableReason}
            workspaceId={workspaceId}
          />
        ) : (
          children
        )}
      </Layout.Content>

      <MilestoneDetailsSheet projectId={projectId} workspaceId={workspaceId} />
      <CreateProjectModal
        open={isCreateProjectModalOpen}
        onClose={() => setIsCreateProjectModalOpen(false)}
      />
      {createType !== null && !unavailableReason && (
        <CreateTaskModal
          open
          type={createType}
          projectId={projectId}
          status={resolvedRoute === "backlog" ? "planned" : undefined}
          onClose={() => setCreateType(null)}
        />
      )}
    </Layout>
  );
}
