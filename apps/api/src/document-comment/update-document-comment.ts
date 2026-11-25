import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { documentCommentTable } from "../database/schema";
import type { z } from "../openapi";
import { retryTransaction } from "../utils/retry-transaction";
import { findCommentDocument } from "./find-comment-document";
import { findOwnComment } from "./find-own-comment";
import { publishDocumentCommentEvent } from "./publish-document-comment-event";
import { readCommentThreads } from "./read-comment-threads";
import type { updateDocumentCommentBody } from "./schema";
import type { CommentTarget } from "./target";

export async function updateDocumentComment(
  target: CommentTarget,
  commentId: string,
  body: z.infer<typeof updateDocumentCommentBody>,
) {
  const thread = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await findCommentDocument(tx, target, true);
      const comment = await findOwnComment(tx, target, commentId);
      const [updated] = await tx
        .update(documentCommentTable)
        .set({ content: body.content, editedAt: new Date() })
        .where(
          and(
            eq(documentCommentTable.id, comment.id),
            eq(documentCommentTable.userId, target.userId),
          ),
        )
        .returning({ id: documentCommentTable.id });
      if (!updated)
        throw new HTTPException(404, { message: "Comment not found" });
      const [thread] = await readCommentThreads(
        tx,
        target,
        comment.parentId ?? comment.id,
      );
      return thread!;
    }),
  );
  await publishDocumentCommentEvent(target, "edited", {
    threadId: thread.id,
    commentId,
  });
  return thread;
}
