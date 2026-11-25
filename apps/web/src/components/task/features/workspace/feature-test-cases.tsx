import { useTranslation } from "react-i18next";
import { groupByMilestone } from "@/components/test-cases/group-test-cases";
import { TestCaseList } from "@/components/test-cases/test-case-list";
import { TestCaseQueryState } from "@/components/test-cases/test-case-query-state";
import { TestCaseStatusCounts } from "@/components/test-cases/test-case-status-counts";
import { useFeatureTestCases } from "@/hooks/queries/test-case/use-feature-test-cases";

// Every test case linked to the Feature's milestones, grouped by milestone.
export function FeatureTestCases({
  featureId,
  projectId,
}: {
  featureId: string;
  projectId: string;
}) {
  const { t } = useTranslation();
  const result = useFeatureTestCases(projectId, featureId);
  if (!result.data)
    return (
      <TestCaseQueryState
        isPending={result.isPending}
        isError={result.isError}
        onRetry={() => void result.refetch()}
      />
    );
  const groups = groupByMilestone(result.data.data);
  if (!groups.length)
    return (
      <p className="text-sm text-muted-foreground">
        {t("tasks:testCases.featureEmpty")}
      </p>
    );
  return (
    <div className="flex flex-col gap-5">
      <TestCaseStatusCounts counts={result.data.statusCounts} />
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            {group.title ?? t("tasks:testCases.hiddenMilestone")}
          </h3>
          <TestCaseList testCases={group.testCases} showMilestone={false} />
        </section>
      ))}
    </div>
  );
}
