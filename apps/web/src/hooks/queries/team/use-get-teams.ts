import { useQuery } from "@tanstack/react-query";
import { getTeams } from "@/fetchers/team/get-teams";
import { teamsKey } from "./team-keys";

export function useGetTeams(workspaceId: string) {
  return useQuery({
    queryKey: teamsKey(workspaceId),
    queryFn: () => getTeams(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
