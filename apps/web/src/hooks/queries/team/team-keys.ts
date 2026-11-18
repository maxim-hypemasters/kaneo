// One key per workspace: a mutation or a TEAMS_UPDATED socket message
// refreshes the whole list.
export const teamsKey = (workspaceId: string) =>
  ["teams", workspaceId] as const;
