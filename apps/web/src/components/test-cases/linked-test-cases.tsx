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
  link: { milestoneId: string } | { bugId: string };
  // "sheet" matches the other headings of the milestone details panel.
  heading?: "section" | "sheet";
}) {
  const { t } = useTranslation();
  const { canReadTestCases } = useWorkspacePermission();
  const enabled = canReadTestCases();
  const result = useProjectTestCases(
    projectId,
    { ...link, limit: "100" },
    enabled,
  );
  if (!enabled) return null;
  const byMilestone = "milestoneId" in link;
  const counts = result.data && (
    <TestCaseStatusCounts counts={result.data.statusCounts} />
  );
  const add = (
    <NewTestCaseButton
      projectId={projectId}
      variant="ghost"
      initialMilestoneId={byMilestone ? link.milestoneId : null}
      initialBugId={byMilestone ? null : link.bugId}
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
