import { client } from "@kaneo/libs";
import { readTestCaseResponse } from "./read-test-case-response";
import type { TestCaseComment } from "./types";

export async function updateTestCaseComment(
  testCaseId: string,
  commentId: string,
  content: string,
) {
  return readTestCaseResponse<TestCaseComment>(
    await client["test-case"][":id"].comments[":commentId"].$patch({
      param: { id: testCaseId, commentId },
      json: { content },
    }),
  );
}
