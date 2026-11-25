import { Bug, Diamond } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { groupByReleaseSource } from "@/components/test-cases/group-test-cases";
import { TestCaseList } from "@/components/test-cases/test-case-list";
import { TestCaseQueryState } from "@/components/test-cases/test-case-query-state";
import { TestCaseStatusCounts } from "@/components/test-cases/test-case-status-counts";
import { useReleaseTestCases } from "@/hooks/queries/test-case/use-release-test-cases";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

// Test cases of the milestones planned for this release and of its bugs.
export function ReleaseTestCases({
  projectId,
  releaseId,
}: {
  projectId: string;
  releaseId: string;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const { canReadTestCases } = useWorkspacePermission();
  const enabled = canReadTestCases();
  const result = useReleaseTestCases(projectId, releaseId, enabled);
  if (!enabled) return null;
  const groups = result.data
    ? groupByReleaseSource(result.data.data, releaseId)
    : [];
  return (
    <section aria-labelledby={headingId} className="pb-6">
      <h3
        id={headingId}
        className="flex h-10 items-center gap-3 border-border/60 border-b bg-muted/40 px-4 font-medium text-sm"
      >
        {t("tasks:testCases.title")}
        {result.data && (
          <TestCaseStatusCounts counts={result.data.statusCounts} />
        )}
      </h3>
      <div className="flex flex-col gap-4 px-4 py-4">
        {!result.data ? (
          <TestCaseQueryState
            isPending={result.isPending}
            isError={result.isError}
            onRetry={() => void result.refetch()}
          />
        ) : groups.length ? (
          groups.map((group) => {
            const Icon = group.kind === "milestone" ? Diamond : Bug;
            return (
              <section key={group.key} className="flex flex-col gap-2">
                <h4 className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">
                    {t(
                      group.kind === "milestone"
                        ? "tasks:testCases.fields.milestone"
                        : "tasks:testCases.fields.bug",
                    )}
                    :
                  </span>
                  {group.title ??
                    t(
                      group.kind === "milestone"
                        ? "tasks:testCases.hiddenMilestone"
                        : "tasks:testCases.hiddenBug",
                    )}
                </h4>
                <TestCaseList
                  testCases={group.testCases}
                  showMilestone={group.kind !== "milestone"}
                  showBug={group.kind !== "bug"}
                />
              </section>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("tasks:testCases.releaseEmpty")}
          </p>
        )}
      </div>
    </section>
  );
}
