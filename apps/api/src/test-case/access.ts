import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../database";
import { testCaseTable } from "../database/schema";
import type { TestCaseScope } from "./schema";

export type TestCaseTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export async function findTestCase(
  tx: Pick<TestCaseTransaction, "select">,
  scope: TestCaseScope,
  id: string,
  lock = false,
) {
  const query = tx
    .select()
    .from(testCaseTable)
    .where(
      and(
        eq(testCaseTable.id, id),
        eq(testCaseTable.projectId, scope.projectId),
      ),
    );
  const [testCase] = await (lock ? query.for("update") : query);
  if (!testCase)
    throw new HTTPException(404, { message: "Test case not found" });
  return testCase;
}
