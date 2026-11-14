import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProjectHomePage } from "@/components/project/home/project-home-page";
import {
  opensTaskOnDefaultView,
  type ProjectHomeSearch,
  validateProjectHomeSearch,
} from "@/components/project/home/project-home-search";
import { applyDefaultProjectView } from "@/components/project/views/apply-default-project-view";
import { PROJECT_ROUTE_PATHS } from "@/components/project/views/project-views";
import {
  type FeatureWorkspaceSearch,
  validateFeatureWorkspaceSearch,
} from "@/components/task/features/workspace/feature-workspace-search";

type ProjectSearchParams = FeatureWorkspaceSearch &
  ProjectHomeSearch & {
    taskId?: string;
  };

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/",
)({
  validateSearch: (search: Record<string, unknown>): ProjectSearchParams => ({
    ...validateFeatureWorkspaceSearch(search),
    ...validateProjectHomeSearch(search),
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
  beforeLoad: ({ params, search, preload }) => {
    if (!opensTaskOnDefaultView(search)) return;
    throw redirect({
      to: PROJECT_ROUTE_PATHS[applyDefaultProjectView({ preload })],
      params,
      search,
      replace: true,
    });
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId, workspaceId } = Route.useParams();
  const { tab, documentId, documentFeatureId } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <ProjectHomePage
      workspaceId={workspaceId}
      projectId={projectId}
      tab={tab ?? "overview"}
      openDocument={
        documentId ? { id: documentId, featureId: documentFeatureId } : null
      }
      onTabChange={(next) =>
        void navigate({
          search: next === "documents" ? { tab: "documents" } : {},
        })
      }
      onOpenDocument={(next) =>
        void navigate({
          search: next
            ? {
                tab: "documents",
                documentId: next.id,
                ...(next.featureId
                  ? { documentFeatureId: next.featureId }
                  : {}),
              }
            : { tab: "documents" },
        })
      }
    />
  );
}
