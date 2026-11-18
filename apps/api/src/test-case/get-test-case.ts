import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { milestoneTable, testCaseTable } from "../database/schema";
import type { TestCaseReadAccess, TestCaseScope } from "./schema";
import {
  bugJoin,
  featureJoin,
  linkedBug,
  linkedFeature,
  milestoneJoin,
  summaryColumns,
  toTestCaseSummary,
} from "./select-test-cases";

export async function getTestCase(
  scope: TestCaseScope,
  id: string,
  access: TestCaseReadAccess,
) {
  const [row] = await db
    .select({
      ...summaryColumns,
      description: testCaseTable.description,
      steps: testCaseTable.steps,
      expectedResult: testCaseTable.expectedResult,
    })
    .from(testCaseTable)
    .leftJoin(milestoneTable, milestoneJoin)
    .leftJoin(linkedFeature, featureJoin)
    .leftJoin(linkedBug, bugJoin)
    .where(
      and(
        eq(testCaseTable.id, id),
        eq(testCaseTable.projectId, scope.projectId),
      ),
    );
  if (!row) throw new HTTPException(404, { message: "Test case not found" });
  return {
    ...toTestCaseSummary(row, access),
    description: row.description,
    steps: row.steps,
    expectedResult: row.expectedResult,
  };
}
