import { useMutation, useQueryClient } from "@tanstack/react-query";
import { linkTeamProject } from "@/fetchers/team/link-team-project";
import type { Team } from "@/fetchers/team/types";
import { unlinkTeamProject } from "@/fetchers/team/unlink-team-project";
import { teamsKey } from "@/hooks/queries/team/team-keys";
import { invalidateTeamAccess } from "./invalidate-team-access";
import { replaceTeamInList } from "./replace-team-in-list";

export function useSetTeamProjectLink(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      teamId,
      projectId,
      linked,
    }: {
      teamId: string;
      projectId: string;
      linked: boolean;
    }) =>
      linked
        ? linkTeamProject(teamId, projectId)
        : unlinkTeamProject(teamId, projectId),
    onSuccess: (saved) =>
      queryClient.setQueryData<Team[]>(teamsKey(workspaceId), (teams) =>
        replaceTeamInList(teams, saved),
      ),
    onSettled: () => invalidateTeamAccess(queryClient, workspaceId),
  });
}
