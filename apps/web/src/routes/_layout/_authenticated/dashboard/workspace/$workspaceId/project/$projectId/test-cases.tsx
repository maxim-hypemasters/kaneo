import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { TestCasesPage } from "@/components/test-cases/test-cases-page";
import useGetProject from "@/hooks/queries/project/use-get-project";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/test-cases",
)({ component: TestCasesRoute });

function TestCasesRoute() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { data: project } = useGetProject({ id: projectId, workspaceId });
  return (
    <>
      <PageTitle
        title={t("tasks:testCases.pageTitle", { name: project?.name })}
      />
      <TestCasesPage projectId={projectId} workspaceId={workspaceId} />
    </>
  );
}
