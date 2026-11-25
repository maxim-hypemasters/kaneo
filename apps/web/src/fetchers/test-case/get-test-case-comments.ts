import { client } from "@kaneo/libs";
import { readTestCaseResponse } from "./read-test-case-response";
import type { TestCaseCommentList } from "./types";

export async function getTestCaseComments(testCaseId: string) {
  return readTestCaseResponse<TestCaseCommentList>(
    await client["test-case"][":id"].comments.$get({
      param: { id: testCaseId },
    }),
  );
}
