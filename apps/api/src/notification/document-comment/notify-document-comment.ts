import { and, eq, ne, or } from "drizzle-orm";
import db from "../../database";
import { documentCommentTable, userTable } from "../../database/schema";
import { parseMentionIds } from "../../utils/parse-mentions";
import { workspaceMembersWithPermission } from "../../utils/workspace-members-with-permission";
import createNotification from "../controllers/create-notification";
import type { DocumentResourceType } from "../document-resource";
import { documentCommentPreview } from "./document-comment-preview";
import { planDocumentCommentNotifications } from "./plan-document-comment-notifications";

export type DocumentCommentNotice = {
  comment: {
    id: string;
    // The thread this comment replies to; null when it starts a thread.
    parentId: string | null;
    userId: string;
    content: string;
  };
  // The text the thread is attached to.
  quote: string | null;
  document:
    | { kind: "page"; id: string; title: string }
    | { kind: "feature"; id: string; title: string; featureId: string };
  projectId: string;
  workspaceId: string;
};

const QUOTE_LENGTH = 240;

function shortQuote(quote: string | null) {
  if (!quote) return null;
  const characters = [...quote];
  return characters.length > QUOTE_LENGTH
    ? `${characters
        .slice(0, QUOTE_LENGTH - 1)
        .join("")
        .trimEnd()}…`
    : quote;
}

async function notify(notice: DocumentCommentNotice) {
  const { comment, document } = notice;
  const threadId = comment.parentId ?? comment.id;
  const mentionedIds = parseMentionIds(comment.content);
  const participants = comment.parentId
    ? await db
        .select({ userId: documentCommentTable.userId })
        .from(documentCommentTable)
        .where(
          and(
            or(
              eq(documentCommentTable.id, threadId),
              eq(documentCommentTable.parentId, threadId),
            ),
            ne(documentCommentTable.id, comment.id),
          ),
        )
    : [];
  const participantIds = participants.map((row) => row.userId);
  if (
    ![...mentionedIds, ...participantIds].some(
      (userId) => userId && userId !== comment.userId,
    )
  )
    return;

  // Notification access checks membership and project access only, so the
  // read permission is checked here: a member whose role cannot open the
  // document must not receive its title and a preview of the comment.
  const [readerIds, [actor]] = await Promise.all([
    workspaceMembersWithPermission(
      notice.workspaceId,
      document.kind === "page" ? { document: ["read"] } : { feature: ["read"] },
    ),
    db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, comment.userId)),
  ]);
  const planned = planDocumentCommentNotifications({
    authorId: comment.userId,
    mentionedIds,
    participantIds,
    readerIds,
  });
  const resourceType: DocumentResourceType =
    document.kind === "page" ? "project_document" : "feature_document";
  // Flat strings only: rows are forwarded to webhooks, MCP and the CLI.
  const eventData = {
    workspaceId: notice.workspaceId,
    projectId: notice.projectId,
    documentKind: document.kind,
    documentId: document.id,
    documentTitle: document.title,
    featureId: document.kind === "feature" ? document.featureId : null,
    threadId,
    commentId: comment.id,
    actorId: comment.userId,
    actorName: actor?.name ?? null,
    commentPreview: documentCommentPreview(comment.content),
    quote: shortQuote(notice.quote),
  };
  for (const row of planned)
    await createNotification({
      userId: row.userId,
      type: row.type,
      eventData,
      resourceId: document.id,
      resourceType,
    });
}

// Call once after the comment's transaction commits. It never rejects: the
// comment is already stored, and a failed request would be retried into a
// duplicate.
export async function notifyDocumentComment(
  notice: DocumentCommentNotice,
): Promise<void> {
  try {
    await notify(notice);
  } catch (error) {
    console.error("Failed to notify about a document comment", {
      commentId: notice.comment.id,
      error,
    });
  }
}
