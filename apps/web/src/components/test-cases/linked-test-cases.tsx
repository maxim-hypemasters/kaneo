import { useTranslation } from "react-i18next";
import { SectionHeader } from "@/components/task/sections/section-header";
import { useProjectTestCases } from "@/hooks/queries/test-case/use-project-test-cases";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { NewTestCaseButton } from "./new-test-case-button";
import { TestCaseList } from "./test-case-list";
import { TestCaseQueryState } from "./test-case-query-state";
import { TestCaseStatusCounts } from "./test-case-status-counts";

// The test cases linked to one milestone or bug, with a button that adds one
// already linked to it.
export function LinkedTestCases({
  projectId,
  link,
  heading = "section",
}: {
  projectId: string;
  // The milestone or bug, with the label a new test case's chip shows.
  link:
    | { milestone: { id: string; label: string } }
    | { bug: { id: string; label: string } };
  // "sheet" matches the other headings of the milestone details panel.
  heading?: "section" | "sheet";
}) {
  const { t } = useTranslation();
  const { canReadTestCases } = useWorkspacePermission();
  const enabled = canReadTestCases();
  const byMilestone = "milestone" in link;
  const result = useProjectTestCases(
    projectId,
    {
      ...("milestone" in link
        ? { milestoneId: link.milestone.id }
        : { bugId: link.bug.id }),
      limit: "100",
    },
    enabled,
  );
  if (!enabled) return null;
  const counts = result.data && (
    <TestCaseStatusCounts counts={result.data.statusCounts} />
  );
  const add = (
    <NewTestCaseButton
      projectId={projectId}
      variant="ghost"
      initialMilestone={"milestone" in link ? link.milestone : null}
      initialBug={"bug" in link ? link.bug : null}
    />
  );
  return (
    <section className="flex flex-col gap-2">
      {heading === "sheet" ? (
        <div className="flex items-center gap-2">
          <h2 className="font-medium">{t("tasks:testCases.title")}</h2>
          {counts}
          <span className="flex-1" />
          {add}
        </div>
      ) : (
        <SectionHeader
          title={t("tasks:testCases.title")}
          meta={counts}
          action={add}
        />
      )}
      {result.data ? (
        result.data.data.length ? (
          <TestCaseList
            testCases={result.data.data}
            showMilestone={!byMilestone}
            showBug={byMilestone}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("tasks:testCases.noneLinked")}
          </p>
        )
      ) : (
        <TestCaseQueryState
          isPending={result.isPending}
          isError={result.isError}
          onRetry={() => void result.refetch()}
        />
      )}
    </section>
  );
}
