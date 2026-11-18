import { client } from "@kaneo/libs";
import { readTestCaseResponse } from "./read-test-case-response";
import type { TestCase } from "./types";

export async function getTestCase(id: string) {
  return readTestCaseResponse<TestCase>(
    await client["test-case"][":id"].$get({ param: { id } }),
  );
}
