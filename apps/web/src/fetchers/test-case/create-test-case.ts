import { client } from "@kaneo/libs";
import { readTestCaseResponse } from "./read-test-case-response";
import type { CreateTestCaseInput, TestCase } from "./types";

export async function createTestCase(
  projectId: string,
  json: CreateTestCaseInput,
) {
  return readTestCaseResponse<TestCase>(
    await client["test-case"].project[":projectId"].$post({
      param: { projectId },
      json,
    }),
  );
}
