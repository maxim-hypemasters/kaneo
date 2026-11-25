import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { documentCommentTable } from "../database/schema";
import type { DocumentTransaction } from "../project-document/access";
import { type CommentTarget, onCommentDocument } from "./target";

// Locks a comment of the target document for its author to change. A comment
// on another document is as missing as one that does not exist.
export async function findOwnComment(
  tx: DocumentTransaction,
  target: CommentTarget,
  commentId: string,
) {
  const [comment] = await tx
    .select({
      id: documentCommentTable.id,
      parentId: documentCommentTable.parentId,
      userId: documentCommentTable.userId,
    })
    .from(documentCommentTable)
    .where(
      and(eq(documentCommentTable.id, commentId), onCommentDocument(target)),
    )
    .for("update");
  if (!comment) throw new HTTPException(404, { message: "Comment not found" });
  if (comment.userId !== target.userId)
    throw new HTTPException(403, {
      message: "Only the comment author may change it",
    });
  return comment;
}
