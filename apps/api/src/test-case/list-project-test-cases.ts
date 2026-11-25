import { eq } from "drizzle-orm";
import { testCaseTable } from "../database/schema";
import { assertAuthorizedProjectSnapshot } from "../milestone/access-scope";
import { boundedTaskRead } from "../task/bounded-read";
import type {
  TestCaseListQuery,
  TestCaseReadAccess,
  TestCaseScope,
} from "./schema";
import { listTestCases } from "./select-test-cases";

export async function listProjectTestCases(
  scope: TestCaseScope,
  query: TestCaseListQuery,
  access: TestCaseReadAccess,
) {
  return boundedTaskRead(async (tx) => {
    await assertAuthorizedProjectSnapshot(
      tx,
      scope.projectId,
      scope.workspaceId,
    );
    return listTestCases(tx, {
      scope: eq(testCaseTable.projectId, scope.projectId),
      query,
      access,
    });
  }, "Test case request took too long; retry later");
}
