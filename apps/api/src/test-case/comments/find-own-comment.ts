import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { testCaseCommentTable } from "../../database/schema";
import type { TestCaseTransaction } from "../access";
import type { TestCaseScope } from "../schema";

// Only its author edits or deletes a comment. Anyone else gets the same 404
// as for a comment that doesn't exist.
export async function findOwnComment(
  tx: Pick<TestCaseTransaction, "select">,
  scope: TestCaseScope,
  testCaseId: string,
  commentId: string,
) {
  const [comment] = await tx
    .select({
      id: testCaseCommentTable.id,
      content: testCaseCommentTable.content,
    })
    .from(testCaseCommentTable)
    .where(
      and(
        eq(testCaseCommentTable.id, commentId),
        eq(testCaseCommentTable.testCaseId, testCaseId),
        eq(testCaseCommentTable.userId, scope.userId),
      ),
    )
    .for("update");
  if (!comment)
    throw new HTTPException(404, {
      message: "Comment not found or you are not the author",
    });
  return comment;
}
