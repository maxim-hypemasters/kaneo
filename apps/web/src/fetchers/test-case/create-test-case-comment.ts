import { client } from "@kaneo/libs";
import { readTestCaseResponse } from "./read-test-case-response";
import type { TestCaseComment } from "./types";

export async function createTestCaseComment(
  testCaseId: string,
  content: string,
) {
  return readTestCaseResponse<TestCaseComment>(
    await client["test-case"][":id"].comments.$post({
      param: { id: testCaseId },
      json: { content },
    }),
  );
}
