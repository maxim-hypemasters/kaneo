import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTeam } from "@/fetchers/team/create-team";
import { teamsKey } from "@/hooks/queries/team/team-keys";

export function useCreateTeam(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createTeam(workspaceId, name),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: teamsKey(workspaceId) }),
  });
}
