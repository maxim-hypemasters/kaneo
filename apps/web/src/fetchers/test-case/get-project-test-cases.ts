import { client } from "@kaneo/libs";
import { readTestCaseResponse } from "./read-test-case-response";
import type { TestCaseList, TestCaseListQuery } from "./types";

export async function getProjectTestCases(
  projectId: string,
  query: TestCaseListQuery,
) {
  return readTestCaseResponse<TestCaseList>(
    await client["test-case"].project[":projectId"].$get({
      param: { projectId },
      query,
    }),
  );
}
