import type { QueryClient } from "@tanstack/react-query";
import { teamsKey } from "@/hooks/queries/team/team-keys";

// Team members and links change who can open which projects, which the
// project lists and the Members page show.
export function invalidateTeamAccess(
  queryClient: QueryClient,
  workspaceId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: teamsKey(workspaceId) }),
    queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] }),
    queryClient.invalidateQueries({
      queryKey: ["workspace-users", workspaceId],
    }),
  ]);
}
