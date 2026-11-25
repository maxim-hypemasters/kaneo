import { nullableResponseTimestamp, responseTimestamp, z } from "../openapi";
import { commentAnchorSchema } from "./anchor-schema";
import { isStorableText, UNSTORABLE_TEXT_MESSAGE } from "./storable-text";

const content = z
  .string()
  .trim()
  .min(1)
  .max(10_000)
  .refine(isStorableText, UNSTORABLE_TEXT_MESSAGE)
  .openapi({
    description:
      "The comment as Markdown, up to 10,000 characters. It may mention people with kaneo-mention tags. Comments take no uploads.",
  });

const commentId = z.string().min(1);
export const pageCommentParams = z.object({
  id: z.string().min(1),
  commentId,
});
export const featureCommentParams = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  commentId,
});

export const createDocumentCommentBody = z
  .object({ content, anchor: commentAnchorSchema })
  .strict();
export const replyToDocumentCommentBody = z.object({ content }).strict();
export const updateDocumentCommentBody = z.object({ content }).strict();
export const documentCommentResolutionBody = z
  .object({
    resolved: z.boolean().openapi({
      description: "true resolves the thread, false reopens it.",
    }),
  })
  .strict();

export const documentCommentSchema = z
  .object({
    id: z.string(),
    parentId: z.string().nullable().openapi({
      description:
        "The thread's root comment for a reply; null for the root itself.",
    }),
    userId: z.string().nullable().openapi({
      description: "The author. Null once their account is deleted.",
    }),
    userName: z.string().nullable(),
    userImage: z.string().nullable(),
    content: z.string(),
    createdAt: responseTimestamp,
    editedAt: nullableResponseTimestamp.openapi({
      description:
        "When the author last changed the text. Null if never; resolving, replying and document saves leave it alone.",
    }),
  })
  .openapi("DocumentComment");

export const documentCommentThreadSchema = documentCommentSchema
  .extend({
    anchor: commentAnchorSchema.openapi({
      description:
        "The part of the document the thread is attached to. Document bodies carry no comment markers, so clients find this text in the current body and treat the thread as detached when it is gone.",
    }),
    resolvedAt: nullableResponseTimestamp,
    resolvedBy: z.string().nullable(),
    resolvedByName: z.string().nullable(),
    replies: z.array(documentCommentSchema).openapi({
      description: "Replies, oldest first. Replies cannot be replied to.",
    }),
  })
  .openapi("DocumentCommentThread");

export const documentCommentThreadListSchema = z.array(
  documentCommentThreadSchema,
);

export const deletedDocumentCommentSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  deletedCount: z.number().int().openapi({
    description:
      "Comments deleted: the comment itself plus, for a thread's root, its replies.",
  }),
});

export type DocumentComment = z.infer<typeof documentCommentSchema>;
export type DocumentCommentThread = z.infer<typeof documentCommentThreadSchema>;
