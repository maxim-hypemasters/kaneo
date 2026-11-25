import { eq } from "drizzle-orm";
import db from "../database";
import { testCaseTable } from "../database/schema";
import { lockAuthorizedProject } from "../milestone/access-scope";
import { retryTransaction } from "../utils/retry-transaction";
import { findTestCase } from "./access";
import { publishTestCaseChange } from "./publish-test-case-change";
import type { TestCaseScope } from "./schema";

export async function deleteTestCase(scope: TestCaseScope, id: string) {
  await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockAuthorizedProject(tx, scope.projectId, scope.workspaceId);
      await findTestCase(tx, scope, id, true);
      await tx.delete(testCaseTable).where(eq(testCaseTable.id, id));
    }),
  );
  await publishTestCaseChange(scope, id);
  return { id };
}
