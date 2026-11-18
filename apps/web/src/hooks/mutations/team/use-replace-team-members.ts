import { useMutation, useQueryClient } from "@tanstack/react-query";
import { replaceTeamMembers } from "@/fetchers/team/replace-team-members";
import type { Team } from "@/fetchers/team/types";
import { teamsKey } from "@/hooks/queries/team/team-keys";
import { invalidateTeamAccess } from "./invalidate-team-access";
import { replaceTeamInList } from "./replace-team-in-list";

export function useReplaceTeamMembers(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userIds }: { id: string; userIds: string[] }) =>
      replaceTeamMembers(id, userIds),
    onSuccess: (saved) =>
      queryClient.setQueryData<Team[]>(teamsKey(workspaceId), (teams) =>
        replaceTeamInList(teams, saved),
      ),
    onSettled: () => invalidateTeamAccess(queryClient, workspaceId),
  });
}
