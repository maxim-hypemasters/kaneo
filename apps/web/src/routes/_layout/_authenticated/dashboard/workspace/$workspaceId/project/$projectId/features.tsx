import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FeatureLibraryPage } from "@/components/features/feature-library-page";
import PageTitle from "@/components/page-title";
import useGetProject from "@/hooks/queries/project/use-get-project";
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/features",
)({ component: FeaturesRoute });
function FeaturesRoute() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { data: project } = useGetProject({ id: projectId, workspaceId });
  return (
    <>
      <PageTitle
        title={t("tasks:features.library.pageTitle", { name: project?.name })}
      />
      <FeatureLibraryPage projectId={projectId} workspaceId={workspaceId} />
    </>
  );
}
