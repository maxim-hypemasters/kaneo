import { and, eq, isNotNull, ne, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  milestoneTable,
  releaseTable,
  testCaseTable,
} from "../database/schema";
import { assertAuthorizedProjectSnapshot } from "../milestone/access-scope";
import { boundedTaskRead } from "../task/bounded-read";
import type {
  TestCaseListQuery,
  TestCaseReadAccess,
  TestCaseScope,
} from "./schema";
import { linkedBug, linkedFeature, listTestCases } from "./select-test-cases";

// A test case is in a release when its milestone is planned for the release,
// or its bug is in the release and not archived. A milestone shown on the
// release only because some of its work is in it doesn't count.
export async function listReleaseTestCases(
  scope: TestCaseScope,
  releaseId: string,
  query: TestCaseListQuery,
  access: TestCaseReadAccess,
) {
  return boundedTaskRead(async (tx) => {
    await assertAuthorizedProjectSnapshot(
      tx,
      scope.projectId,
      scope.workspaceId,
    );
    const [release] = await tx
      .select({ id: releaseTable.id })
      .from(releaseTable)
      .where(
        and(
          eq(releaseTable.id, releaseId),
          eq(releaseTable.projectId, scope.projectId),
        ),
      );
    if (!release)
      throw new HTTPException(404, { message: "Release not found" });
    return listTestCases(tx, {
      scope: and(
        eq(testCaseTable.projectId, scope.projectId),
        or(
          and(
            eq(milestoneTable.releaseId, releaseId),
            isNotNull(linkedFeature.id),
          ),
          and(
            eq(linkedBug.releaseId, releaseId),
            ne(linkedBug.status, "archived"),
          ),
        ),
      ),
      query,
      access,
    });
  }, "Test case request took too long; retry later");
}
