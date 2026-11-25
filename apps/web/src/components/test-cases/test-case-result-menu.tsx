import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import type { TestCaseStatus } from "@/fetchers/test-case/types";
import { isTestCaseStatus, TEST_CASE_STATUS_LABELS } from "./test-case-status";
import { testCaseStatusOptions } from "./test-case-status-options";

export function TestCaseResultMenu({
  value,
  onSelect,
}: {
  value: TestCaseStatus;
  onSelect: (status: TestCaseStatus) => void;
}) {
  const { t } = useTranslation();
  return (
    <OptionMenu
      label={t("tasks:testCases.fields.status")}
      placeholder={t("tasks:testCases.pickers.result")}
      options={testCaseStatusOptions(value, (status) =>
        t(TEST_CASE_STATUS_LABELS[status]),
      )}
      onSelect={(next) => {
        if (isTestCaseStatus(next)) onSelect(next);
      }}
    />
  );
}
