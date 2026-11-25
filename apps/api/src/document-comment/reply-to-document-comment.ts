import { and, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { documentCommentTable } from "../database/schema";
import { notifyDocumentComment } from "../notification/document-comment/notify-document-comment";
import type { z } from "../openapi";
import { retryTransaction } from "../utils/retry-transaction";
import { commentNotice } from "./comment-notice";
import { findCommentDocument } from "./find-comment-document";
import { publishDocumentCommentEvent } from "./publish-document-comment-event";
import { readCommentThreads } from "./read-comment-threads";
import type { replyToDocumentCommentBody } from "./schema";
import {
  type CommentTarget,
  commentDocumentValues,
  onCommentDocument,
} from "./target";

export async function replyToDocumentComment(
  target: CommentTarget,
  threadId: string,
  body: z.infer<typeof replyToDocumentCommentBody>,
) {
  const { thread, reply, title } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const document = await findCommentDocument(tx, target, true);
      // Locking the root keeps a concurrent delete or resolve of the thread
      // from interleaving with the reply.
      const [root] = await tx
        .select({
          id: documentCommentTable.id,
          resolvedAt: documentCommentTable.resolvedAt,
        })
        .from(documentCommentTable)
        .where(
          and(
            eq(documentCommentTable.id, threadId),
            onCommentDocument(target),
            isNull(documentCommentTable.parentId),
          ),
        )
        .for("update");
      if (!root)
        throw new HTTPException(404, { message: "Comment thread not found" });
      const [created] = await tx
        .insert(documentCommentTable)
        .values({
          ...commentDocumentValues(target),
          parentId: root.id,
          userId: target.userId,
          content: body.content,
        })
        .returning({ id: documentCommentTable.id });
      if (root.resolvedAt)
        await tx
          .update(documentCommentTable)
          .set({ resolvedAt: null, resolvedBy: null })
          .where(eq(documentCommentTable.id, root.id));
      const [thread] = await readCommentThreads(tx, target, root.id);
      return {
        thread: thread!,
        reply: thread!.replies.find((reply) => reply.id === created!.id)!,
        title: document.title,
      };
    }),
  );
  await publishDocumentCommentEvent(target, "replied", {
    threadId: thread.id,
    commentId: reply.id,
  });
  await notifyDocumentComment(
    commentNotice(target, title, reply, thread.anchor.quote),
  );
  return thread;
}
