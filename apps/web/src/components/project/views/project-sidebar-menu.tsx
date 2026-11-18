import { useNavigate, useRouter } from "@tanstack/react-router";
import {
  ClipboardCheck,
  Inbox,
  Layers,
  Rocket,
  SquareKanban,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useCachedTriageCount } from "@/hooks/queries/task/use-cached-triage-count";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { useGetTriageMembers } from "@/hooks/queries/triage/use-get-triage-members";
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
  const { data: triageMembers } = useGetTriageMembers(projectId);
  const triageCount = useCachedTriageCount(projectId);
  // Triage shows while the project uses it or work is still waiting there.
  const showTriage = !!triageMembers?.length || !!triageCount;
  const { canReadTestCases } = useWorkspacePermission();
  const entries = [
    {
      scope: "tasks",
      view: tasksViewFor(taskLayout, viewMode),
      label: "tasks:title",
      icon: SquareKanban,
    },
    ...(showTriage
      ? [
          {
            scope: "triage" as const,
            view: "triage" as const,
            label: "tasks:triage.title",
            icon: Inbox,
            count: triageCount,
          },
        ]
      : []),
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
    ...(canReadTestCases()
      ? [
          {
            scope: "testCases" as const,
            view: "testCases" as const,
            label: "tasks:testCases.title",
            icon: ClipboardCheck,
          },
        ]
      : []),
  ] satisfies {
    scope: ProjectSidebarScope;
    view: ProjectView;
    label: string;
    icon: typeof SquareKanban;
    count?: number;
  }[];
  return (
    <nav
      aria-label={t("navigation:projectList.navigationLabel", {
        name: projectName,
      })}
    >
      <SidebarMenuSub>
        {entries.map((entry) => {
          const { scope, view, label, icon: Icon } = entry;
          const count = "count" in entry ? entry.count : undefined;
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
                {count ? (
                  <span
                    className="ml-auto text-xs tabular-nums text-muted-foreground"
                    aria-label={t("tasks:triage.waitingCount", { count })}
                  >
                    {count}
                  </span>
                ) : null}
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          );
        })}
      </SidebarMenuSub>
    </nav>
  );
}
