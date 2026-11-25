import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
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
import { readTestCaseComment } from "./read-test-case-comments";

export async function updateTestCaseComment(
  scope: TestCaseScope,
  testCaseId: string,
  commentId: string,
  content: string,
) {
  await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockAuthorizedProject(tx, scope.projectId, scope.workspaceId);
      // The test case owns the uploads its comments share, so it stays locked
      // while the ones this edit removed are deleted.
      await findTestCase(tx, scope, testCaseId, true);
      const current = await findOwnComment(tx, scope, testCaseId, commentId);
      await tx
        .update(testCaseCommentTable)
        .set({ content })
        .where(eq(testCaseCommentTable.id, commentId));
      await deleteUnreferencedAssets(
        tx,
        { testCaseId },
        removedAssetIds(current.content, content),
      );
    }),
  );
  const comment = await readTestCaseComment(commentId);
  if (!comment) throw new HTTPException(404, { message: "Comment not found" });
  await publishTestCaseCommentChange(scope, testCaseId);
  return comment;
}
