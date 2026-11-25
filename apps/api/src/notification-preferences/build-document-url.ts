// Opens a project page or a Feature document in the project's Documents tab,
// with a comment thread focused when one is given.
export function buildDocumentUrl(
  clientUrl: string,
  target: {
    workspaceId: string;
    projectId: string;
    documentId: string;
    // The Feature a Feature document belongs to; null for a project page.
    featureId: string | null;
    threadId: string | null;
  },
) {
  const search = new URLSearchParams({
    tab: "documents",
    documentId: target.documentId,
  });
  if (target.featureId) search.set("documentFeatureId", target.featureId);
  if (target.threadId) search.set("commentId", target.threadId);
  return `${clientUrl}/dashboard/workspace/${encodeURIComponent(
    target.workspaceId,
  )}/project/${encodeURIComponent(target.projectId)}?${search}`;
}
