import { Bug, Diamond } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TestCaseSummary } from "@/fetchers/test-case/types";
import { openTestCaseDetails } from "@/store/test-case-details";
import { bugLabel } from "./bug-label";
import { TestCaseStatusBadge } from "./test-case-status-badge";

export function TestCaseRow({
  testCase,
  showMilestone = true,
  showBug = true,
}: {
  testCase: TestCaseSummary;
  showMilestone?: boolean;
  showBug?: boolean;
}) {
  const { t } = useTranslation();
  const milestone =
    showMilestone && testCase.milestoneId
      ? testCase.milestone
        ? `${testCase.milestone.featureTitle} / ${testCase.milestone.title}`
        : t("tasks:testCases.hiddenMilestone")
      : null;
  const bug =
    showBug && testCase.bugId
      ? testCase.bug
        ? bugLabel(testCase.bug)
        : t("tasks:testCases.hiddenBug")
      : null;
  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
      onClick={() => openTestCaseDetails(testCase.projectId, testCase.id)}
    >
      <TestCaseStatusBadge status={testCase.status} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{testCase.title}</span>
        {(milestone || bug) && (
          <span className="mt-0.5 flex min-w-0 flex-wrap gap-x-3 text-xs text-muted-foreground">
            {milestone && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Diamond aria-hidden="true" className="size-3 shrink-0" />
                <span className="sr-only">
                  {t("tasks:testCases.fields.milestone")}:
                </span>
                <span className="truncate">{milestone}</span>
              </span>
            )}
            {bug && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Bug aria-hidden="true" className="size-3 shrink-0" />
                <span className="sr-only">
                  {t("tasks:testCases.fields.bug")}:
                </span>
                <span className="truncate">{bug}</span>
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}
