import { eq } from "drizzle-orm";
import db from "../../database";
import { userTable } from "../../database/schema";
import { newMentionIds } from "../../utils/new-mention-ids";
import { workspaceMembersWithPermission } from "../../utils/workspace-members-with-permission";
import createNotification from "../controllers/create-notification";
import type { DocumentResourceType } from "../document-resource";

export type DocumentMentionNotice = {
  document:
    | { kind: "page"; id: string; title: string }
    | { kind: "feature"; id: string; title: string; featureId: string };
  projectId: string;
  workspaceId: string;
  authorId: string;
  // The body before this save; null for a new document.
  before: string | null;
  after: string;
};

async function notify(notice: DocumentMentionNotice) {
  const { document } = notice;
  const mentionedIds = newMentionIds(
    notice.before,
    notice.after,
    notice.authorId,
  );
  if (!mentionedIds.length) return;
  // Notification access checks membership and project access only, so the
  // read permission is checked here: a member whose role cannot open the
  // document must not receive its title.
  const [readerIds, [actor]] = await Promise.all([
    workspaceMembersWithPermission(
      notice.workspaceId,
      document.kind === "page" ? { document: ["read"] } : { feature: ["read"] },
    ),
    db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, notice.authorId)),
  ]);
  const readers = new Set(readerIds);
  const resourceType: DocumentResourceType =
    document.kind === "page" ? "project_document" : "feature_document";
  // The same flat fields as a mention in a comment, with no comment: rows are
  // forwarded to webhooks, MCP and the CLI.
  const eventData = {
    workspaceId: notice.workspaceId,
    projectId: notice.projectId,
    documentKind: document.kind,
    documentId: document.id,
    documentTitle: document.title,
    featureId: document.kind === "feature" ? document.featureId : null,
    threadId: null,
    commentId: null,
    actorId: notice.authorId,
    actorName: actor?.name ?? null,
    commentPreview: null,
    quote: null,
  };
  for (const userId of mentionedIds) {
    if (!readers.has(userId)) continue;
    await createNotification({
      userId,
      type: "document_mention",
      eventData,
      resourceId: document.id,
      resourceType,
    });
  }
}

// Tells people newly @mentioned in a page or Feature document's text. Call it
// once after the save commits. It never rejects: the document is already
// saved, and a failed request would be retried into a conflict.
export async function notifyDocumentMentions(
  notice: DocumentMentionNotice,
): Promise<void> {
  try {
    await notify(notice);
  } catch (error) {
    console.error("Failed to notify about document mentions", {
      documentId: notice.document.id,
      error,
    });
  }
}
