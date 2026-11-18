import type { TestCaseSummary } from "@/fetchers/test-case/types";
import { TestCaseRow } from "./test-case-row";

export function TestCaseList({
  testCases,
  showMilestone,
  showBug,
}: {
  testCases: readonly TestCaseSummary[];
  showMilestone?: boolean;
  showBug?: boolean;
}) {
  return (
    <ul className="divide-y rounded-lg border">
      {testCases.map((testCase) => (
        <li key={testCase.id}>
          <TestCaseRow
            testCase={testCase}
            showMilestone={showMilestone}
            showBug={showBug}
          />
        </li>
      ))}
    </ul>
  );
}
