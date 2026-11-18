import { ListFilter } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import { chipClass } from "@/components/shared/modals/create-task/chip-class";
import { Input } from "@/components/ui/input";
import type {
  TestCaseStatus,
  TestCaseStatusCounts,
} from "@/fetchers/test-case/types";
import { TestCasePicker } from "./test-case-picker";
import {
  isTestCaseStatus,
  TEST_CASE_STATUS_LABELS,
  TEST_CASE_STATUSES,
} from "./test-case-status";
import { TestCaseStatusIcon } from "./test-case-status-icon";
import { testCaseStatusOptions } from "./test-case-status-options";

export function TestCaseFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  counts,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  status: TestCaseStatus | null;
  onStatusChange: (status: TestCaseStatus | null) => void;
  counts?: TestCaseStatusCounts;
}) {
  const { t } = useTranslation();
  const total = counts
    ? TEST_CASE_STATUSES.reduce((sum, key) => sum + counts[key], 0)
    : undefined;
  const allLabel = t("tasks:testCases.filters.allStatuses");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="max-w-md"
        type="search"
        value={search}
        aria-label={t("tasks:testCases.search")}
        placeholder={t("tasks:testCases.search")}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <TestCasePicker
        width="w-60"
        trigger={
          <button
            type="button"
            className={chipClass(status !== null)}
            aria-label={`${t("tasks:testCases.filters.status")}: ${
              status ? t(TEST_CASE_STATUS_LABELS[status]) : allLabel
            }`}
          >
            {status ? (
              <TestCaseStatusIcon status={status} />
            ) : (
              <ListFilter aria-hidden="true" className="size-3.5" />
            )}
            <span>
              {status ? t(TEST_CASE_STATUS_LABELS[status]) : allLabel}
            </span>
            {counts && (
              <span className="text-muted-foreground tabular-nums">
                {status ? counts[status] : total}
              </span>
            )}
          </button>
        }
      >
        {(close) => (
          <OptionMenu
            label={t("tasks:testCases.filters.status")}
            placeholder={t("tasks:testCases.pickers.filterResult")}
            // The hints are counts; digit shortcuts beside them would read as
            // numbers too.
            numberShortcuts={false}
            options={[
              {
                value: "",
                label: allLabel,
                hint: total === undefined ? undefined : String(total),
                icon: <ListFilter className="text-muted-foreground" />,
                selected: status === null,
                pinned: true,
              },
              ...testCaseStatusOptions(
                status,
                (key) => t(TEST_CASE_STATUS_LABELS[key]),
                counts ? (key) => String(counts[key]) : undefined,
              ),
            ]}
            onSelect={(value) => {
              onStatusChange(isTestCaseStatus(value) ? value : null);
              close();
            }}
          />
        )}
      </TestCasePicker>
    </div>
  );
}
