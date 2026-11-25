import { and, asc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { documentCommentTable, userTable } from "../database/schema";
import type { DocumentTransaction } from "../project-document/access";
import type { DocumentComment, DocumentCommentThread } from "./schema";
import { type CommentDocument, onCommentDocument } from "./target";

const author = alias(userTable, "document_comment_author");
const resolver = alias(userTable, "document_comment_resolver");

// A document's threads, or just one of them, oldest first with their replies
// oldest first. Replies carry their thread's document, so one indexed read by
// document returns both.
export async function readCommentThreads(
  tx: Pick<DocumentTransaction, "select">,
  document: CommentDocument,
  threadId?: string,
): Promise<DocumentCommentThread[]> {
  const rows = await tx
    .select({
      id: documentCommentTable.id,
      parentId: documentCommentTable.parentId,
      userId: documentCommentTable.userId,
      userName: author.name,
      userImage: author.image,
      content: documentCommentTable.content,
      createdAt: documentCommentTable.createdAt,
      editedAt: documentCommentTable.editedAt,
      anchorQuote: documentCommentTable.anchorQuote,
      anchorPrefix: documentCommentTable.anchorPrefix,
      anchorSuffix: documentCommentTable.anchorSuffix,
      resolvedAt: documentCommentTable.resolvedAt,
      resolvedBy: documentCommentTable.resolvedBy,
      resolvedByName: resolver.name,
    })
    .from(documentCommentTable)
    .leftJoin(author, eq(documentCommentTable.userId, author.id))
    .leftJoin(resolver, eq(documentCommentTable.resolvedBy, resolver.id))
    .where(
      and(
        onCommentDocument(document),
        threadId
          ? or(
              eq(documentCommentTable.id, threadId),
              eq(documentCommentTable.parentId, threadId),
            )
          : undefined,
      ),
    )
    .orderBy(asc(documentCommentTable.createdAt), asc(documentCommentTable.id));

  const comment = (row: (typeof rows)[number]): DocumentComment => ({
    id: row.id,
    parentId: row.parentId,
    userId: row.userId,
    userName: row.userName,
    userImage: row.userImage,
    content: row.content,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
  });
  const threads = new Map<string, DocumentCommentThread>();
  for (const row of rows)
    if (!row.parentId)
      threads.set(row.id, {
        ...comment(row),
        anchor: {
          quote: row.anchorQuote ?? "",
          prefix: row.anchorPrefix ?? "",
          suffix: row.anchorSuffix ?? "",
        },
        resolvedAt: row.resolvedAt,
        resolvedBy: row.resolvedBy,
        resolvedByName: row.resolvedByName,
        replies: [],
      });
  for (const row of rows)
    if (row.parentId) threads.get(row.parentId)?.replies.push(comment(row));
  return [...threads.values()];
}
