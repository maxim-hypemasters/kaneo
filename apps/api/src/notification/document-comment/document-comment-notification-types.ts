export const DOCUMENT_COMMENT_NOTIFICATION_TYPES = [
  // Someone @mentioned the recipient in a comment on a document.
  "document_mention",
  // Someone replied in a comment thread the recipient started or replied in.
  "document_comment_reply",
] as const;

export type DocumentCommentNotificationType =
  (typeof DOCUMENT_COMMENT_NOTIFICATION_TYPES)[number];

export function isDocumentCommentNotificationType(
  type: string,
): type is DocumentCommentNotificationType {
  return (DOCUMENT_COMMENT_NOTIFICATION_TYPES as readonly string[]).includes(
    type,
  );
}
