import { useNavigate, useRouter } from "@tanstack/react-router";
import { Layers, Rocket, SquareKanban, SquircleDashed } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { isPlainClick } from "./is-plain-click";
import type { ProjectSidebarScope } from "./project-sidebar-scope";
import {
  isTaskLayoutView,
  PROJECT_ROUTE_PATHS,
  routeForView,
  tasksViewFor,
  type ProjectView,
} from "./project-views";

export function ProjectSidebarMenu({
  workspaceId,
  projectId,
  projectName,
  activeScope,
}: {
  workspaceId: string;
  projectId: string;
  projectName: string;
  activeScope: ProjectSidebarScope | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const taskLayout = useUserPreferencesStore((state) => state.taskLayout);
  const viewMode = useUserPreferencesStore((state) => state.viewMode);
  const entries = [
    {
      scope: "tasks",
      view: tasksViewFor(taskLayout, viewMode),
      label: "tasks:title",
      icon: SquareKanban,
    },
    {
      scope: "backlog",
      view: "backlog",
      label: "tasks:view.backlog",
      icon: SquircleDashed,
    },
    {
      scope: "features",
      view: "features",
      label: "tasks:features.library.title",
      icon: Layers,
    },
    {
      scope: "releases",
      view: "releases",
      label: "tasks:view.releases",
      icon: Rocket,
    },
  ] satisfies {
    scope: ProjectSidebarScope;
    view: ProjectView;
    label: string;
    icon: typeof SquareKanban;
  }[];
  return (
    <nav
      aria-label={t("navigation:projectList.navigationLabel", {
        name: projectName,
      })}
    >
      <SidebarMenuSub>
        {entries.map(({ scope, view, label, icon: Icon }) => {
          const to = PROJECT_ROUTE_PATHS[routeForView(view)];
          const params = { workspaceId, projectId };
          const href = router.buildLocation({ to, params, search: {} }).href;
          return (
            <SidebarMenuSubItem key={scope}>
              <SidebarMenuSubButton
                href={href}
                isActive={scope === activeScope}
                aria-current={scope === activeScope ? "page" : undefined}
                onClick={(event) => {
                  if (!isPlainClick(event)) return;
                  event.preventDefault();
                  if (scope === "tasks" && isTaskLayoutView(view)) {
                    const { setTaskLayout, setViewMode } =
                      useUserPreferencesStore.getState();
                    if (view === "board" || view === "list") setViewMode(view);
                    setTaskLayout(view);
                  }
                  setOpenMobile(false);
                  void navigate({ to, params, search: {} });
                }}
              >
                <Icon aria-hidden="true" />
                <span>{t(label)}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          );
        })}
      </SidebarMenuSub>
    </nav>
  );
}
