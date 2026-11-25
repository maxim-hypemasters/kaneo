import { getEventDataRecord } from "@/components/notification/notification-text";

export type DocumentCommentTarget = {
  workspaceId: string;
  projectId: string;
  documentId: string;
  // Set for a Feature document.
  featureId: string | null;
  // The thread to show.
  commentId: string | null;
  title: string | null;
  quote: string | null;
};

function text(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

// Where a document comment notification leads. The list fills in the
// document's current project and workspace; without them there is nowhere to
// go, so the notification shows as text only.
export function documentCommentTarget(notification: {
  resourceType: string | null;
  resourceId: string | null;
  eventData: unknown;
}): DocumentCommentTarget | null {
  const feature = notification.resourceType === "feature_document";
  if (!feature && notification.resourceType !== "project_document") return null;
  const data = getEventDataRecord(notification.eventData) ?? {};
  const workspaceId = text(data.workspaceId);
  const projectId = text(data.projectId);
  const featureId = feature ? text(data.featureId) : null;
  if (!notification.resourceId || !workspaceId || !projectId) return null;
  if (feature && !featureId) return null;
  return {
    workspaceId,
    projectId,
    documentId: notification.resourceId,
    featureId,
    commentId: text(data.threadId),
    title: text(data.documentTitle),
    quote: text(data.quote),
  };
}
