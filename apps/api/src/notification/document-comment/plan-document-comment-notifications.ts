import type { DocumentCommentNotificationType } from "./document-comment-notification-types";

export type PlannedDocumentCommentNotification = {
  userId: string;
  type: DocumentCommentNotificationType;
};

// Who hears about one new comment. A mention outranks a reply, so nobody gets
// two notifications for the same comment, and the author gets none.
export function planDocumentCommentNotifications(input: {
  authorId: string;
  // Users @mentioned in the comment.
  mentionedIds: readonly string[];
  // For a reply: who started the thread and who replied before. Empty for a
  // comment that starts a thread.
  participantIds: readonly (string | null)[];
  // Members allowed to read the document.
  readerIds: readonly string[];
}): PlannedDocumentCommentNotification[] {
  const readers = new Set(input.readerIds);
  const planned = new Map<string, PlannedDocumentCommentNotification>();
  const add = (
    userIds: readonly (string | null)[],
    type: DocumentCommentNotificationType,
  ) => {
    for (const userId of userIds) {
      if (!userId || userId === input.authorId) continue;
      if (!readers.has(userId) || planned.has(userId)) continue;
      planned.set(userId, { userId, type });
    }
  };
  add(input.mentionedIds, "document_mention");
  add(input.participantIds, "document_comment_reply");
  return [...planned.values()];
}
