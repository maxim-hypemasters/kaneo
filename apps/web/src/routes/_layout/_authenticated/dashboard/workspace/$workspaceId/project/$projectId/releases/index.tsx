import { createFileRoute } from "@tanstack/react-router";
import { ReleaseListPage } from "@/components/releases/list/release-list-page";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/releases/",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId, workspaceId } = Route.useParams();

  return <ReleaseListPage workspaceId={workspaceId} projectId={projectId} />;
}
