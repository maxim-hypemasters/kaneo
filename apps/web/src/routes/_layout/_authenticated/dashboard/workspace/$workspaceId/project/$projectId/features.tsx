import { createFileRoute } from "@tanstack/react-router";
import { FeatureLibraryPage } from "@/components/features/feature-library-page";
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/features",
)({ component: FeaturesRoute });
function FeaturesRoute() {
  const { projectId, workspaceId } = Route.useParams();
  return <FeatureLibraryPage projectId={projectId} workspaceId={workspaceId} />;
}
