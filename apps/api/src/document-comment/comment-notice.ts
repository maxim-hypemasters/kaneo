import type { DocumentCommentNotice } from "../notification/document-comment/notify-document-comment";
import type { CommentTarget } from "./target";

// What the notifier needs to know about a comment the requester just wrote.
export function commentNotice(
  target: CommentTarget,
  title: string,
  comment: { id: string; parentId: string | null; content: string },
  quote: string,
): DocumentCommentNotice {
  return {
    comment: {
      id: comment.id,
      parentId: comment.parentId,
      userId: target.userId,
      content: comment.content,
    },
    quote,
    document:
      target.kind === "page"
        ? { kind: "page", id: target.documentId, title }
        : {
            kind: "feature",
            id: target.documentId,
            title,
            featureId: target.featureId,
          },
    projectId: target.projectId,
    workspaceId: target.workspaceId,
  };
}
