import type { FeatureWorkspaceSearch } from "./workspace/feature-workspace-search";

// The one place that decides how a Feature opens: in the task route, with
// the Feature workspace tab and content in the search params.
export function featureRoute(
  workspaceId: string,
  projectId: string,
  featureId: string,
  search: FeatureWorkspaceSearch = {},
) {
  return {
    to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
    params: { workspaceId, projectId, taskId: featureId },
    search,
  } as const;
}
