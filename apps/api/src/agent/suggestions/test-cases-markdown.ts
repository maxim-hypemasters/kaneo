import type { TestCaseDraft } from "../agent-types";

export const TEST_CASES_HEADING = "Test cases";

const HEADING = /^ {0,3}#{1,6}[ \t]+test cases:?[ \t]*#*[ \t]*$/im;

/** Whether the description already has a "Test cases" section. */
export function hasTestCasesHeading(description: string | null) {
  return HEADING.test(description ?? "");
}

/** Test cases as a "Test cases" section to append to a description. */
export function testCasesMarkdown(cases: readonly TestCaseDraft[]) {
  const sections = cases.map((testCase, index) =>
    [
      `### ${index + 1}. ${testCase.title}`,
      testCase.steps && `**Steps**\n\n${testCase.steps}`,
      testCase.expectedResult &&
        `**Expected result**\n\n${testCase.expectedResult}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
  return [`## ${TEST_CASES_HEADING}`, ...sections].join("\n\n");
}
