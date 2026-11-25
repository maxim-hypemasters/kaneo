// One key per project: a mutation or a PROJECT_LINKS_UPDATED socket message
// refreshes the whole list.
export const projectLinksKey = (projectId: string) =>
  ["project-links", projectId] as const;
