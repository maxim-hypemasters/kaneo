import { eq } from "drizzle-orm";
import db from "../../database";
import { testCaseCommentTable } from "../../database/schema";
import { findTestCase } from "../access";
import type { TestCaseScope } from "../schema";
import { readTestCaseComments } from "./read-test-case-comments";

export async function listTestCaseComments(
  scope: TestCaseScope,
  testCaseId: string,
) {
  await findTestCase(db, scope, testCaseId);
  return {
    data: await readTestCaseComments(
      eq(testCaseCommentTable.testCaseId, testCaseId),
    ),
  };
}
