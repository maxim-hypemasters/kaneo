import { useTranslation } from "react-i18next";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { ProjectScopeLink } from "./project-scope-link";
import {
  isTaskLayoutView,
  type ProjectView,
  tasksViewFor,
} from "./project-views";

type ProjectScopeToggleProps = {
  workspaceId: string;
  projectId: string;
  currentView: ProjectView;
  onSelect: (view: ProjectView) => void;
};

export function ProjectScopeToggle({
  workspaceId,
  projectId,
  currentView,
  onSelect,
}: ProjectScopeToggleProps) {
  const { t } = useTranslation();
  const taskLayout = useUserPreferencesStore((state) => state.taskLayout);
  const viewMode = useUserPreferencesStore((state) => state.viewMode);
  const onTasks = isTaskLayoutView(currentView);
  const tasksView = onTasks ? currentView : tasksViewFor(taskLayout, viewMode);

  return (
    <nav
      aria-label={t("tasks:view.heading")}
      // Never a scroll container: a hidden scrollbar cut the last link off at
      // 375px. On phones the project layout moves the toolbar to a second row
      // when both don't fit; only a nav wider than the whole row shrinks, and
      // its labels then end in an ellipsis.
      className="flex h-7 min-w-0 max-w-full items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5 sm:shrink-0 max-sm:[&>a]:px-1.5 max-sm:[&>a]:text-xs dark:bg-input/32"
    >
      <ProjectScopeLink
        view={tasksView}
        workspaceId={workspaceId}
        projectId={projectId}
        active={onTasks}
        onSelect={onSelect}
      >
        {t("tasks:title")}
      </ProjectScopeLink>
      <ProjectScopeLink
        view="backlog"
        workspaceId={workspaceId}
        projectId={projectId}
        active={currentView === "backlog"}
        onSelect={onSelect}
      >
        {t("tasks:view.backlog")}
      </ProjectScopeLink>
      <ProjectScopeLink
        view="features"
        workspaceId={workspaceId}
        projectId={projectId}
        active={currentView === "features"}
        onSelect={onSelect}
      >
        {t("tasks:features.library.title")}
      </ProjectScopeLink>
      <ProjectScopeLink
        view="releases"
        workspaceId={workspaceId}
        projectId={projectId}
        active={currentView === "releases"}
        onSelect={onSelect}
      >
        {t("tasks:view.releases")}
      </ProjectScopeLink>
    </nav>
  );
}
