// Comment threads have their own key, apart from the document's: an autosave
// that refreshes the body must not refetch its comments, and a new comment
// must not refetch the body.
export const projectDocumentCommentsKey = (projectId: string) =>
  ["document-comments", projectId] as const;

export const documentCommentsKey = (projectId: string, documentId: string) =>
  [...projectDocumentCommentsKey(projectId), documentId] as const;
