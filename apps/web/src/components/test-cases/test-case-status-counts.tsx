import { useTranslation } from "react-i18next";
import type { TestCaseStatusCounts } from "@/fetchers/test-case/types";
import {
  TEST_CASE_STATUS_LABELS,
  TEST_CASE_STATUSES,
} from "./test-case-status";

// "2 Passed · 1 Failed", skipping statuses nobody has.
export function TestCaseStatusCounts({
  counts,
}: {
  counts: TestCaseStatusCounts;
}) {
  const { t } = useTranslation();
  const parts = TEST_CASE_STATUSES.filter((status) => counts[status] > 0);
  if (!parts.length) return null;
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {parts
        .map(
          (status) => `${counts[status]} ${t(TEST_CASE_STATUS_LABELS[status])}`,
        )
        .join(" · ")}
    </span>
  );
}
