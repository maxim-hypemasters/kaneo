// The tree key is a prefix of every page's key, so invalidating it refreshes
// the tree and any open page.
export const projectDocumentsKey = (projectId: string) =>
  ["project-documents", projectId] as const;

export const projectDocumentKey = (projectId: string, documentId: string) =>
  [...projectDocumentsKey(projectId), "document", documentId] as const;
