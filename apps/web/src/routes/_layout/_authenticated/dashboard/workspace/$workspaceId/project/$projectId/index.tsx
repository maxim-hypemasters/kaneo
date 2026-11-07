import {
  validateFeatureWorkspaceSearch,
  type FeatureWorkspaceSearch,
} from "@/components/task/features/workspace/feature-workspace-search";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { applyDefaultProjectView } from "@/components/project/views/apply-default-project-view";
import { PROJECT_ROUTE_PATHS } from "@/components/project/views/project-views";

type ProjectSearchParams = FeatureWorkspaceSearch & {
  taskId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/",
)({
  validateSearch: (search: Record<string, unknown>): ProjectSearchParams => ({
    ...validateFeatureWorkspaceSearch(search),
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
