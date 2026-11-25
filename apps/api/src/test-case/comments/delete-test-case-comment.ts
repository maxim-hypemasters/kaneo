import { eq } from "drizzle-orm";
import db from "../../database";
import { testCaseCommentTable } from "../../database/schema";
import { lockAuthorizedProject } from "../../milestone/access-scope";
import {
  deleteUnreferencedAssets,
  removedAssetIds,
} from "../../storage/cleanup-assets";
import { retryTransaction } from "../../utils/retry-transaction";
import { findTestCase } from "../access";
import type { TestCaseScope } from "../schema";
import { findOwnComment } from "./find-own-comment";
import { publishTestCaseCommentChange } from "./publish-test-case-comment-change";

export async function deleteTestCaseComment(
  scope: TestCaseScope,
  testCaseId: string,
  commentId: string,
) {
  await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockAuthorizedProject(tx, scope.projectId, scope.workspaceId);
      await findTestCase(tx, scope, testCaseId, true);
      const current = await findOwnComment(tx, scope, testCaseId, commentId);
      await tx
        .delete(testCaseCommentTable)
        .where(eq(testCaseCommentTable.id, commentId));
      await deleteUnreferencedAssets(
        tx,
        { testCaseId },
        removedAssetIds(current.content, null),
      );
    }),
  );
  await publishTestCaseCommentChange(scope, testCaseId);
  return { id: commentId };
}
