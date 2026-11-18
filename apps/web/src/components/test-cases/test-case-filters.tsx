import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  TestCaseStatus,
  TestCaseStatusCounts,
} from "@/fetchers/test-case/types";
import {
  isTestCaseStatus,
  TEST_CASE_STATUS_LABELS,
  TEST_CASE_STATUSES,
} from "./test-case-status";

const ALL = "all";

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
  const withCount = (label: string, count?: number) =>
    count === undefined ? label : `${label} (${count})`;
  const total = counts
    ? TEST_CASE_STATUSES.reduce((sum, key) => sum + counts[key], 0)
    : undefined;
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
      <Select
        value={status ?? ALL}
        onValueChange={(next) => {
          if (next === ALL) onStatusChange(null);
          else if (isTestCaseStatus(next)) onStatusChange(next);
        }}
      >
        <SelectTrigger
          size="sm"
          className="w-auto min-w-36"
          aria-label={t("tasks:testCases.filters.status")}
        >
          <SelectValue>
            {status === null
              ? withCount(t("tasks:testCases.filters.allStatuses"), total)
              : withCount(t(TEST_CASE_STATUS_LABELS[status]), counts?.[status])}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>
            {withCount(t("tasks:testCases.filters.allStatuses"), total)}
          </SelectItem>
          {TEST_CASE_STATUSES.map((key) => (
            <SelectItem key={key} value={key}>
              {withCount(t(TEST_CASE_STATUS_LABELS[key]), counts?.[key])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
