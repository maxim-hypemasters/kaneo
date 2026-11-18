import db from "../database";
import { testCaseTable } from "../database/schema";
import { lockAuthorizedProject } from "../milestone/access-scope";
import type { z } from "../openapi";
import { retryTransaction } from "../utils/retry-transaction";
import { getTestCase } from "./get-test-case";
import { lockTestCaseLinks } from "./lock-test-case-links";
import { publishTestCaseChange } from "./publish-test-case-change";
import type {
  createTestCaseBody,
  TestCaseReadAccess,
  TestCaseScope,
} from "./schema";

export async function createTestCase(
  scope: TestCaseScope,
  body: z.infer<typeof createTestCaseBody>,
  access: TestCaseReadAccess,
) {
  const id = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockAuthorizedProject(tx, scope.projectId, scope.workspaceId);
      await lockTestCaseLinks(tx, scope.projectId, body);
      const [created] = await tx
        .insert(testCaseTable)
        .values({
          projectId: scope.projectId,
          title: body.title,
          description: body.description ?? null,
          steps: body.steps ?? null,
          expectedResult: body.expectedResult ?? null,
          status: body.status ?? "not_run",
          milestoneId: body.milestoneId ?? null,
          bugId: body.bugId ?? null,
          createdBy: scope.userId,
        })
        .returning({ id: testCaseTable.id });
      return created!.id;
    }),
  );
  await publishTestCaseChange(scope, id);
  return getTestCase(scope, id, access);
}
