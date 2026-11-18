import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteTeam } from "@/fetchers/team/delete-team";
import { invalidateTeamAccess } from "./invalidate-team-access";

export function useDeleteTeam(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTeam(id),
    onSettled: () => invalidateTeamAccess(queryClient, workspaceId),
  });
}
