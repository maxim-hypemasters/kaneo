import type { TaskType } from "@/types/task";

export type ProjectSidebarScope = "tasks" | "backlog" | "features" | "releases";

export function projectSidebarRoute(pathname: string, workspaceId: string) {
  const match = pathname.match(
    /^\/dashboard\/workspace\/([^/]+)\/project\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?\/?$/,
  );
  if (!match || match[1] !== workspaceId) return null;
  return {
    projectId: match[2],
    section: match[3],
    taskId: match[3] === "task" ? match[4] : undefined,
  };
}

export function projectSidebarScope(
  pathname: string,
  workspaceId: string,
  taskType?: TaskType,
): { projectId: string; scope: ProjectSidebarScope } | null {
  const route = projectSidebarRoute(pathname, workspaceId);
  if (!route) return null;
  let scope: ProjectSidebarScope;
  switch (route.section) {
    case "features":
    case "backlog":
    case "releases":
      scope = route.section;
      break;
    case "board":
    case "calendar":
    case "gantt":
      scope = "tasks";
      break;
    case "task":
      if (!taskType) return null;
      scope = taskType === "feature" ? "features" : "tasks";
      break;
    default:
      return null;
  }
  return { projectId: route.projectId, scope };
}
