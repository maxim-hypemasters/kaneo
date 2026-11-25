import { responseTimestamp, z } from "../../openapi";

export const commentParams = z.object({
  id: z.string().min(1),
  commentId: z.string().min(1),
});

export const testCaseCommentBody = z
  .object({
    content: z.string().trim().min(1).max(10_000).openapi({
      description:
        'Markdown. A `<kaneo-mention id="userId">` tag mentions a member; images uploaded through the comment-upload routes are referenced by their URL.',
    }),
  })
  .strict();

export const testCaseCommentSchema = z
  .object({
    id: z.string(),
    testCaseId: z.string(),
    content: z.string(),
    author: z
      .object({
        id: z.string(),
        name: z.string(),
        image: z.string().nullable(),
      })
      .nullable()
      .openapi({ description: "Null once the author's account is deleted." }),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("TestCaseComment");

export const testCaseCommentListSchema = z
  .object({ data: z.array(testCaseCommentSchema) })
  .openapi("TestCaseCommentList");

export const deletedTestCaseCommentSchema = z.object({ id: z.string() });

export const commentUploadBody = z.object({
  filename: z.string(),
  contentType: z.string(),
  size: z.number(),
});

export const finalizeCommentUploadBody = commentUploadBody.extend({
  key: z
    .string()
    .openapi({ description: "The key returned when the URL was issued." }),
});

export type CommentUpload = z.infer<typeof commentUploadBody>;
