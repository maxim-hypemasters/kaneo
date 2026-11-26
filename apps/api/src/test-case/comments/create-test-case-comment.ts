import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { testCaseCommentTable } from "../../database/schema";
import { lockAuthorizedProject } from "../../milestone/access-scope";
import { retryTransaction } from "../../utils/retry-transaction";
import { findTestCase } from "../access";
import { parseMentionIds } from "../../utils/parse-mentions";
import type { TestCaseScope } from "../schema";
import { notifyMentionedMembers } from "./notify-mentioned-members";
import { publishTestCaseCommentChange } from "./publish-test-case-comment-change";
import { readTestCaseComment } from "./read-test-case-comments";

export async function createTestCaseComment(
  scope: TestCaseScope,
  testCaseId: string,
  content: string,
) {
  const created = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockAuthorizedProject(tx, scope.projectId, scope.workspaceId);
      // Locked, so the test case can't be deleted under its new comment.
      const testCase = await findTestCase(tx, scope, testCaseId, true);
      const [comment] = await tx
        .insert(testCaseCommentTable)
        .values({ testCaseId, userId: scope.userId, content })
        .returning({ id: testCaseCommentTable.id });
      return { id: comment?.id, title: testCase.title };
    }),
  );
  const comment = created.id ? await readTestCaseComment(created.id) : null;
  if (!comment)
    throw new HTTPException(500, { message: "Failed to create comment" });
  await publishTestCaseCommentChange(scope, testCaseId);
  await notifyMentionedMembers(
    scope,
    { id: testCaseId, title: created.title },
    parseMentionIds(content),
  );
  return comment;
}
