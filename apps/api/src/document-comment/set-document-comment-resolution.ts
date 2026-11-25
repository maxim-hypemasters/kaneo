import { and, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { documentCommentTable } from "../database/schema";
import { retryTransaction } from "../utils/retry-transaction";
import { findCommentDocument } from "./find-comment-document";
import { publishDocumentCommentEvent } from "./publish-document-comment-event";
import { readCommentThreads } from "./read-comment-threads";
import { type CommentTarget, onCommentDocument } from "./target";

// Anyone who may edit the document can resolve or reopen a thread. Asking for
// the state it already has writes nothing and announces nothing, so the first
// resolver and time stay.
export async function setDocumentCommentResolution(
  target: CommentTarget,
  threadId: string,
  resolved: boolean,
) {
  const { thread, changed } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await findCommentDocument(tx, target, true);
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
      const changed = resolved !== (root.resolvedAt !== null);
      if (changed)
        await tx
          .update(documentCommentTable)
          .set(
            resolved
              ? { resolvedAt: new Date(), resolvedBy: target.userId }
              : { resolvedAt: null, resolvedBy: null },
          )
          .where(eq(documentCommentTable.id, root.id));
      const [thread] = await readCommentThreads(tx, target, root.id);
      return { thread: thread!, changed };
    }),
  );
  if (changed)
    await publishDocumentCommentEvent(
      target,
      resolved ? "resolved" : "reopened",
      { threadId: thread.id },
    );
  return thread;
}
