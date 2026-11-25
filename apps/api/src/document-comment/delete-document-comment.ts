import { and, count, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { documentCommentTable } from "../database/schema";
import { retryTransaction } from "../utils/retry-transaction";
import { findCommentDocument } from "./find-comment-document";
import { findOwnComment } from "./find-own-comment";
import { publishDocumentCommentEvent } from "./publish-document-comment-event";
import type { CommentTarget } from "./target";

// Deleting a thread's root deletes its replies through the parent_id cascade,
// whoever wrote them.
export async function deleteDocumentComment(
  target: CommentTarget,
  commentId: string,
) {
  const deleted = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await findCommentDocument(tx, target, true);
      const comment = await findOwnComment(tx, target, commentId);
      // Replying locks the root as well, so no reply can be added between
      // this count and the delete.
      const [replies] = comment.parentId
        ? []
        : await tx
            .select({ total: count() })
            .from(documentCommentTable)
            .where(eq(documentCommentTable.parentId, comment.id));
      const [removed] = await tx
        .delete(documentCommentTable)
        .where(
          and(
            eq(documentCommentTable.id, comment.id),
            eq(documentCommentTable.userId, target.userId),
          ),
        )
        .returning({ id: documentCommentTable.id });
      if (!removed)
        throw new HTTPException(404, { message: "Comment not found" });
      return {
        id: comment.id,
        parentId: comment.parentId,
        deletedCount: 1 + (replies?.total ?? 0),
      };
    }),
  );
  await publishDocumentCommentEvent(target, "deleted", {
    threadId: deleted.parentId ?? deleted.id,
    commentId: deleted.id,
  });
  return deleted;
}
