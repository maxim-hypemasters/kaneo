import { asc, eq, type SQL } from "drizzle-orm";
import db from "../../database";
import { testCaseCommentTable, userTable } from "../../database/schema";

// Comments with their author, oldest first.
export async function readTestCaseComments(where: SQL) {
  const rows = await db
    .select({
      id: testCaseCommentTable.id,
      testCaseId: testCaseCommentTable.testCaseId,
      content: testCaseCommentTable.content,
      createdAt: testCaseCommentTable.createdAt,
      updatedAt: testCaseCommentTable.updatedAt,
      authorId: userTable.id,
      authorName: userTable.name,
      authorImage: userTable.image,
    })
    .from(testCaseCommentTable)
    .leftJoin(userTable, eq(userTable.id, testCaseCommentTable.userId))
    .where(where)
    .orderBy(asc(testCaseCommentTable.createdAt), asc(testCaseCommentTable.id));
  return rows.map(({ authorId, authorName, authorImage, ...comment }) => ({
    ...comment,
    author: authorId
      ? { id: authorId, name: authorName ?? "", image: authorImage }
      : null,
  }));
}

export async function readTestCaseComment(id: string) {
  const [comment] = await readTestCaseComments(eq(testCaseCommentTable.id, id));
  return comment;
}
