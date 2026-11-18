import { useMutation, useQueryClient } from "@tanstack/react-query";
import { replaceTeamProjects } from "@/fetchers/team/replace-team-projects";
import type { Team } from "@/fetchers/team/types";
import { teamsKey } from "@/hooks/queries/team/team-keys";
import { invalidateTeamAccess } from "./invalidate-team-access";
import { replaceTeamInList } from "./replace-team-in-list";

export function useReplaceTeamProjects(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectIds }: { id: string; projectIds: string[] }) =>
      replaceTeamProjects(id, projectIds),
    onSuccess: (saved) =>
      queryClient.setQueryData<Team[]>(teamsKey(workspaceId), (teams) =>
        replaceTeamInList(teams, saved),
      ),
    onSettled: () => invalidateTeamAccess(queryClient, workspaceId),
  });
}
