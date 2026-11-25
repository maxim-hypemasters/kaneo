import db from "../database";
import { documentCommentTable } from "../database/schema";
import { notifyDocumentComment } from "../notification/document-comment/notify-document-comment";
import type { z } from "../openapi";
import { retryTransaction } from "../utils/retry-transaction";
import { commentNotice } from "./comment-notice";
import { findCommentDocument } from "./find-comment-document";
import { publishDocumentCommentEvent } from "./publish-document-comment-event";
import { readCommentThreads } from "./read-comment-threads";
import type { createDocumentCommentBody } from "./schema";
import { type CommentTarget, commentDocumentValues } from "./target";

export async function createDocumentComment(
  target: CommentTarget,
  body: z.infer<typeof createDocumentCommentBody>,
) {
  const { thread, title } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const document = await findCommentDocument(tx, target, true);
      const [created] = await tx
        .insert(documentCommentTable)
        .values({
          ...commentDocumentValues(target),
          userId: target.userId,
          content: body.content,
          anchorQuote: body.anchor.quote,
          anchorPrefix: body.anchor.prefix,
          anchorSuffix: body.anchor.suffix,
        })
        .returning({ id: documentCommentTable.id });
      const [thread] = await readCommentThreads(tx, target, created!.id);
      return { thread: thread!, title: document.title };
    }),
  );
  await publishDocumentCommentEvent(target, "created", {
    threadId: thread.id,
    commentId: thread.id,
  });
  await notifyDocumentComment(
    commentNotice(target, title, thread, thread.anchor.quote),
  );
  return thread;
}
