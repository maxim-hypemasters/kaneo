import { eq } from "drizzle-orm";
import db from "../database";
import { testCaseTable } from "../database/schema";
import { lockAuthorizedProject } from "../milestone/access-scope";
import type { z } from "../openapi";
import { newMentionIds } from "../utils/new-mention-ids";
import { retryTransaction } from "../utils/retry-transaction";
import { findTestCase } from "./access";
import { notifyMentionedMembers } from "./comments/notify-mentioned-members";
import { getTestCase } from "./get-test-case";
import { lockTestCaseLinks } from "./lock-test-case-links";
import { publishTestCaseChange } from "./publish-test-case-change";
import type {
  TestCaseReadAccess,
  TestCaseScope,
  updateTestCaseBody,
} from "./schema";

const changed = (next: string | null | undefined, current: string | null) =>
  next !== undefined && next !== current ? next : undefined;

export async function updateTestCase(
  scope: TestCaseScope,
  id: string,
  body: z.infer<typeof updateTestCaseBody>,
  access: TestCaseReadAccess,
) {
  const before = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockAuthorizedProject(tx, scope.projectId, scope.workspaceId);
      const current = await findTestCase(tx, scope, id);
      // Only new targets are checked, so a linked bug later converted to a
      // task doesn't block other edits. Targets lock before the test case.
      await lockTestCaseLinks(tx, scope.projectId, {
        milestoneId: changed(body.milestoneId, current.milestoneId),
        bugId: changed(body.bugId, current.bugId),
      });
      const locked = await findTestCase(tx, scope, id, true);
      await tx.update(testCaseTable).set(body).where(eq(testCaseTable.id, id));
      return locked;
    }),
  );
  await publishTestCaseChange(scope, id);
  // Fields left out of the request keep their text, and their mentions.
  await notifyMentionedMembers(
    scope,
    { id, title: body.title ?? before.title },
    newMentionIds(
      [before.description, before.steps, before.expectedResult],
      [body.description, body.steps, body.expectedResult],
      scope.userId,
    ),
  );
  return getTestCase(scope, id, access);
}
