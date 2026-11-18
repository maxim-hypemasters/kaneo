import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTeam } from "@/fetchers/team/update-team";
import { teamsKey } from "@/hooks/queries/team/team-keys";

export function useUpdateTeam(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateTeam(id, name),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: teamsKey(workspaceId) }),
  });
}
