import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import { TaskDisplayOptions } from "@/components/project/display/task-display-options";
import { ActiveFiltersBar } from "@/components/project/task-filters/active-filters-bar";
import { ProjectToolbar } from "@/components/project/toolbar/project-toolbar";
import { TaskCount } from "@/components/project/toolbar/task-count";
import { useProjectTaskView } from "@/components/project/toolbar/use-project-task-view";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import TriageListView from "@/components/triage-list-view";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useBoardSort } from "@/hooks/use-board-sort";
import { useTriageAccess } from "@/hooks/use-triage-access";
import { sortTasks } from "@/lib/sort-tasks";
import { countTriageTasks } from "@/lib/task-filters/count-tasks";
import { newestFirst } from "@/lib/triage/newest-first";
import useProjectStore from "@/store/project";

type TriageSearchParams = { taskId?: string };

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/triage",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): TriageSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const { data } = useGetTasks(projectId);
  const { project, setProject } = useProjectStore();
  const access = useTriageAccess(projectId);
  const { sort, setSort } = useBoardSort(projectId, "triage");
  const view = useProjectTaskView({
    project,
    projectId,
    workspaceId,
    scope: "triage",
  });
  const { filters } = view;

  useEffect(() => {
    if (data) setProject(data);
  }, [data, setProject]);

  const handleCloseTaskSheet = useCallback(() => {
    navigate({ to: ".", search: {}, replace: true });
  }, [navigate]);

  // Triage has no manual order, so its default is newest first.
  const tasks = useMemo(() => {
    const waiting = filters.filteredProject?.triageTasks ?? [];
    return sort.field === "position"
      ? newestFirst(waiting)
      : sortTasks(waiting, sort);
  }, [filters.filteredProject, sort]);

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="triage"
      toolbar={
        <ProjectToolbar
          view={view}
          display={
            <TaskDisplayOptions
              projectId={projectId}
              sort={sort}
              onSortChange={setSort}
              layout="rows"
            />
          }
        />
      }
      summary={
        <TaskCount
          shown={countTriageTasks(filters.filteredProject)}
          total={countTriageTasks(project)}
        />
      }
      filterBar={
        <ActiveFiltersBar
          subjects={view.subjects}
          onClear={filters.clearFilters}
        />
      }
    >
      <PageTitle title={t("tasks:triage.pageTitle", { name: project?.name })} />
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
        <div className="h-full flex-1 overflow-hidden bg-card">
          {project && project.id === projectId ? (
            <TriageListView
              project={project}
              tasks={tasks}
              canTriage={access.canTriage}
              triageEnabled={access.enabled}
              canManage={access.canManage}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="h-16 w-16 animate-pulse rounded-lg bg-muted" />
            </div>
          )}
        </div>
        <TaskDetailsSheet
          taskId={taskId}
          projectId={projectId}
          workspaceId={workspaceId}
          onClose={handleCloseTaskSheet}
        />
      </div>
    </ProjectLayout>
  );
}
