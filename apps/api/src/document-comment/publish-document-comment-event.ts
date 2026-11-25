import { publishEvent } from "../events";
import type { CommentTarget } from "./target";

export type DocumentCommentChange =
  | "created"
  | "replied"
  | "edited"
  | "deleted"
  | "resolved"
  | "reopened"
  | "anchors";

// Its own event name: integrations mirror task comments to linked issues on
// comment.created, and document comments must never reach them. The payload
// names what changed and never carries comment or document text.
export async function publishDocumentCommentEvent(
  target: CommentTarget,
  change: DocumentCommentChange,
  ids: { threadId?: string; commentId?: string } = {},
) {
  await publishEvent("document.comment.changed", {
    projectId: target.projectId,
    documentId: target.documentId,
    documentKind: target.kind,
    ...(target.featureId ? { featureId: target.featureId } : {}),
    ...ids,
    change,
    userId: target.userId,
  });
}
