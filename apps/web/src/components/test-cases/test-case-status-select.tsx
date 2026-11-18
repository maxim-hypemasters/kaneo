import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TestCaseStatus } from "@/fetchers/test-case/types";
import {
  isTestCaseStatus,
  TEST_CASE_STATUS_LABELS,
  TEST_CASE_STATUSES,
} from "./test-case-status";

export function TestCaseStatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: TestCaseStatus;
  onChange: (status: TestCaseStatus) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (isTestCaseStatus(next)) onChange(next);
      }}
    >
      <SelectTrigger size="sm" aria-label={t("tasks:testCases.fields.status")}>
        <SelectValue>{t(TEST_CASE_STATUS_LABELS[value])}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {TEST_CASE_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {t(TEST_CASE_STATUS_LABELS[status])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
