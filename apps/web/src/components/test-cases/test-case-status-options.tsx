import type { OptionMenuItem } from "@/components/common/option-menu/option-menu-item";
import type { TestCaseStatus } from "@/fetchers/test-case/types";
import { TEST_CASE_STATUSES } from "./test-case-status";
import { TestCaseStatusIcon } from "./test-case-status-icon";

export function testCaseStatusOptions(
  current: TestCaseStatus | null,
  labelOf: (status: TestCaseStatus) => string,
  hintOf?: (status: TestCaseStatus) => string,
): OptionMenuItem[] {
  return TEST_CASE_STATUSES.map((status) => ({
    value: status,
    label: labelOf(status),
    hint: hintOf?.(status),
    icon: <TestCaseStatusIcon status={status} />,
    selected: status === current,
  }));
}
