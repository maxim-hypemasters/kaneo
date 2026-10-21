import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import getTask from "@/fetchers/task/get-task";
import {
  projectSidebarRoute,
  projectSidebarScope,
} from "./project-sidebar-scope";

export function useProjectSidebarScope(workspaceId: string) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const route = projectSidebarRoute(pathname, workspaceId);
  const taskId = route?.taskId ?? "";
  // TaskLayout loads this detail. Observe its result without another read for
  // every expanded project menu or fetching work merely to classify a link.
  const { data: task } = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => getTask(taskId),
    enabled: false,
  });
  return projectSidebarScope(
    pathname,
    workspaceId,
    task?.projectId === route?.projectId ? task?.type : undefined,
  );
}
