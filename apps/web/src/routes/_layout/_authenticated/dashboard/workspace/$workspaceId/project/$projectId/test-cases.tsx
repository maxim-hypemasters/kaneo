import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { TestCasesPage } from "@/components/test-cases/test-cases-page";
import useGetProject from "@/hooks/queries/project/use-get-project";
import { openTestCaseDetails } from "@/store/test-case-details";

type TestCasesSearch = { testCaseId?: string };

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/test-cases",
)({
  component: TestCasesRoute,
  validateSearch: (search: Record<string, unknown>): TestCasesSearch => ({
    testCaseId:
      typeof search.testCaseId === "string" ? search.testCaseId : undefined,
  }),
});

function TestCasesRoute() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { testCaseId } = Route.useSearch();
  const navigate = useNavigate();
  const { data: project } = useGetProject({ id: projectId, workspaceId });
  // A link to a test case, such as from the inbox, opens it over the list.
  // The open test case isn't kept in the URL, so the parameter is dropped.
  useEffect(() => {
    if (!testCaseId) return;
    openTestCaseDetails(projectId, testCaseId);
    void navigate({ to: ".", search: {}, replace: true });
  }, [testCaseId, projectId, navigate]);
  return (
    <>
      <PageTitle
        title={t("tasks:testCases.pageTitle", { name: project?.name })}
      />
      <TestCasesPage projectId={projectId} workspaceId={workspaceId} />
    </>
  );
}
