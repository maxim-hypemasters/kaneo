import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { TestCaseStatus } from "@/fetchers/test-case/types";
import {
  TEST_CASE_STATUS_BADGES,
  TEST_CASE_STATUS_LABELS,
} from "./test-case-status";

export function TestCaseStatusBadge({ status }: { status: TestCaseStatus }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant={TEST_CASE_STATUS_BADGES[status]}
      className="min-w-15 shrink-0"
    >
      {t(TEST_CASE_STATUS_LABELS[status])}
    </Badge>
  );
}
