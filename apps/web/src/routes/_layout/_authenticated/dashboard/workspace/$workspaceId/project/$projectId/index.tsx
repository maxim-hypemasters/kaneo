import { createFileRoute, redirect } from "@tanstack/react-router";
import { applyDefaultProjectView } from "@/components/project/views/apply-default-project-view";
import { PROJECT_ROUTE_PATHS } from "@/components/project/views/project-views";

type ProjectSearchParams = {
  taskId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/",
)({
  validateSearch: (search: Record<string, unknown>): ProjectSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
  beforeLoad: ({ params, search, preload }) => {
    throw redirect({
      to: PROJECT_ROUTE_PATHS[applyDefaultProjectView({ preload })],
      params,
      search,
      replace: true,
    });
  },
});
