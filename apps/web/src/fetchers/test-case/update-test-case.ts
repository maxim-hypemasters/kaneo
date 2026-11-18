import { client } from "@kaneo/libs";
import { readTestCaseResponse } from "./read-test-case-response";
import type { TestCase, UpdateTestCaseInput } from "./types";

export async function updateTestCase(id: string, json: UpdateTestCaseInput) {
  return readTestCaseResponse<TestCase>(
    await client["test-case"][":id"].$patch({ param: { id }, json }),
  );
}
