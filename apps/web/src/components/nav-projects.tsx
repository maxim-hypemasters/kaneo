import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToFirstScrollableAncestor,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ChevronRight,
  Folder,
  Forward,
  MoreHorizontal,
  Plus,
  Settings,
  Trash2,
  Trash2Icon,
  LinkIcon,
} from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ProjectSidebarMenu } from "@/components/project/views/project-sidebar-menu";
import { useProjectMenuExpansion } from "@/components/project/views/use-project-menu-expansion";
import { useProjectSidebarScope } from "@/components/project/views/use-project-sidebar-scope";
import { SidebarProjectItem } from "@/components/sidebar-project-item";
import { useOpenProject } from "@/components/project/views/use-open-project";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import useDeleteProject from "@/hooks/mutations/project/use-delete-project";
import useReorderProjects from "@/hooks/mutations/project/use-reorder-projects";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import type { ProjectWithTasks } from "@/types/project";
import CreateProjectModal from "./shared/modals/create-project-modal";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";

export function NavProjects() {
  const { t } = useTranslation();
  const { isMobile, setOpenMobile } = useSidebar();
  const { data: workspace } = useActiveWorkspace();
  const { data: projects } = useGetProjects(
    {
      workspaceId: workspace?.id || "",
    },
    true,
  );
  const queryClient = useQueryClient();
  const { mutateAsync: deleteProject } = useDeleteProject();
  const reorderProjects = useReorderProjects();
  const { canCreateProjects, canDeleteProjects, canUpdateProjects } =
    useWorkspacePermission();
  const canCreate = canCreateProjects();
  const canDeleteProject = canDeleteProjects();
  // Matches the API, which gates /project/reorder on `project: ["update"]`
  // alone — not the create+update+delete bundle.
  const canReorder = canUpdateProjects();
  const navigate = useNavigate();
  const openProject = useOpenProject();
  const { workspaceId: currentWorkspaceId, projectId: currentProjectId } =
    useParams({
      strict: false,
    });

  const menus = useProjectMenuExpansion(
    workspace?.id,
    currentWorkspaceId === workspace?.id ? currentProjectId : undefined,
  );
  const activeScope = useProjectSidebarScope(workspace?.id || "");

  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] =
    useState(false);
  const [isDeleteProjectModalOpen, setIsDeleteProjectModalOpen] =
    useState(false);
  const [projectToDeleteId, setProjectToDeleteID] = useState<string | null>(
    null,
  );
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(
    null,
  );

  const draggingProject = projects?.find(
    (project) => project.id === draggingProjectId,
  );

  const isCurrentProject = (projectId: string) => {
    return (
      currentProjectId === projectId && currentWorkspaceId === workspace?.id
    );
  };

  const handleProjectClick = (project: ProjectWithTasks) => {
    setOpenMobile(false);
    openProject(workspace?.id || "", project.id);
  };

  // Below these thresholds the row is still a link and the sidebar still
  // scrolls; above them the gesture becomes a drag.
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    document.body.classList.add("kaneo-dragging");
    setDraggingProjectId(String(event.active.id));
  };

  const endDrag = () => {
    document.body.classList.remove("kaneo-dragging");
    setDraggingProjectId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    endDrag();

    if (!over || active.id === over.id || !projects || !workspace) return;

    const oldIndex = projects.findIndex((project) => project.id === active.id);
    const newIndex = projects.findIndex((project) => project.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(projects, oldIndex, newIndex);

    reorderProjects(workspace.id, reordered, {
      onError: () => {
        toast.error(t("workspace:projects.reorderError"));
      },
    });
  };

  if (!workspace) return null;

  return (
    <>
      <Collapsible defaultOpen className="group/collapsible">
        <SidebarGroup className="group-data-[collapsible=icon]:hidden gap-1 p-2 pt-1">
          <CollapsibleTrigger
            className="data-panel-open:[&_svg]:rotate-90"
            render={
              <SidebarGroupLabel className="h-7 cursor-pointer justify-start gap-1 px-0 text-sidebar-accent-foreground" />
            }
          >
            <span>{t("navigation:sidebar.projects")}</span>
            <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/60 transition-transform duration-200" />
          </CollapsibleTrigger>
          {canCreate && (
            <SidebarGroupAction
              className="top-2 right-2 text-sidebar-foreground/70"
              title={t("navigation:projectList.addProject")}
              onClick={() => setIsCreateProjectModalOpen(true)}
            >
              <Plus />
              <span className="sr-only">
                {t("navigation:projectList.addProject")}
              </span>
            </SidebarGroupAction>
          )}
          <CollapsiblePanel>
            <SidebarGroupContent>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[
                  restrictToVerticalAxis,
                  restrictToFirstScrollableAncestor,
                ]}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={endDrag}
              >
                <SidebarMenu className="gap-0.5">
                  <SortableContext
                    items={projects?.map((project) => project.id) ?? []}
                    strategy={verticalListSortingStrategy}
                  >
                    {projects?.map((project) => (
                      <SidebarProjectItem
                        key={`${workspace.id}:${project.id}`}
                        project={project}
                        canReorder={canReorder}
                        current={isCurrentProject(project.id)}
                        expanded={menus.isExpanded(project.id)}
                        onExpandedChange={(open) =>
                          menus.setExpanded(project.id, open)
                        }
                        onOpen={() => handleProjectClick(project)}
                        actions={
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <button
                                  type="button"
                                  // The row is the drag source; this press
                                  // must not reach it.
                                  onPointerDown={(event) =>
                                    event.stopPropagation()
                                  }
                                  className="absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-lg p-0 text-sidebar-foreground outline-hidden ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 peer-hover/menu-button:text-sidebar-accent-foreground after:-inset-2 after:absolute md:after:hidden peer-data-[size=sm]/menu-button:top-1 peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 group-data-[collapsible=icon]:hidden group-focus-within/project-header:opacity-100 group-hover/project-header:opacity-100 data-popup-open:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground md:opacity-0"
                                />
                              }
                            >
                              <MoreHorizontal />
                              <span className="sr-only">
                                {t("navigation:sidebar.more")}
                              </span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              className="min-w-44 rounded-lg"
                              side={isMobile ? "bottom" : "right"}
                              align={isMobile ? "end" : "start"}
                            >
                              <DropdownMenuItem
                                className="h-7 items-start cursor-pointer text-sm"
                                onClick={() => handleProjectClick(project)}
                              >
                                <Folder className="text-muted-foreground" />
                                <span>
                                  {t("navigation:projectList.viewProject")}
                                </span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="h-7 items-start cursor-pointer text-sm"
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    `${window.location.origin}/dashboard/workspace/${workspace?.id}/project/${project.id}`,
                                  );
                                  toast.success(
                                    t("navigation:projectList.linkCopied"),
                                    { icon: LinkIcon },
                                  );
                                }}
                              >
                                <Forward className="text-muted-foreground" />
                                <span>
                                  {t("navigation:projectList.shareProject")}
                                </span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="h-7 items-start cursor-pointer text-sm"
                                onClick={() => {
                                  navigate({
                                    to: "/dashboard/settings/projects/$projectId/general",
                                    params: { projectId: project.id },
                                  });
                                }}
                              >
                                <Settings className="text-muted-foreground" />
                                <span>
                                  {t("navigation:projectList.projectSettings")}
                                </span>
                              </DropdownMenuItem>
                              {canDeleteProject && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="h-7 items-start text-destructive cursor-pointer text-sm"
                                    onClick={() => {
                                      setProjectToDeleteID(project.id);
                                      setIsDeleteProjectModalOpen(true);
                                    }}
                                  >
                                    <Trash2 className="text-destructive" />
                                    <span>
                                      {t(
                                        "navigation:projectList.deleteProject",
                                      )}
                                    </span>
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        }
                      >
                        <ProjectSidebarMenu
                          workspaceId={workspace.id}
                          projectId={project.id}
                          projectName={project.name}
                          activeScope={
                            activeScope?.projectId === project.id
                              ? activeScope.scope
                              : null
                          }
                        />
                      </SidebarProjectItem>
                    ))}
                  </SortableContext>
                </SidebarMenu>

                {/* Portalled: `SidebarContent` is `overflow-auto` and clips it. */}
                {createPortal(
                  <DragOverlay dropAnimation={null}>
                    {draggingProject ? (
                      <div className="flex h-8 w-(--sidebar-width) max-w-64 items-center rounded-lg border bg-sidebar not-dark:bg-clip-padding px-2 text-sm text-sidebar-accent-foreground shadow-lg/5">
                        <span className="truncate">{draggingProject.name}</span>
                      </div>
                    ) : null}
                  </DragOverlay>,
                  document.body,
                )}
              </DndContext>
            </SidebarGroupContent>
          </CollapsiblePanel>
        </SidebarGroup>
      </Collapsible>

      <CreateProjectModal
        open={isCreateProjectModalOpen}
        onClose={() => setIsCreateProjectModalOpen(false)}
      />

      <AlertDialog
        open={isDeleteProjectModalOpen}
        onOpenChange={setIsDeleteProjectModalOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("navigation:projectList.deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("navigation:projectList.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="sm" />}>
              {t("common:actions.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    await deleteProject({
                      id: projectToDeleteId || "",
                    });
                    toast.success(t("navigation:projectList.deletedToast"), {
                      icon: Trash2Icon,
                    });
                    queryClient.invalidateQueries({
                      queryKey: ["projects"],
                    });
                    navigate({
                      to: "/dashboard/workspace/$workspaceId",
                      params: {
                        workspaceId: workspace?.id || "",
                      },
                    });
                  }}
                />
              }
            >
              {t("navigation:projectList.deleteProject")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
