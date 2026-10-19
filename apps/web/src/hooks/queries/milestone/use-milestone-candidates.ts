import { useQuery } from "@tanstack/react-query";
import { getMilestoneCandidates } from "@/fetchers/milestone/get-milestone-candidates";
import { milestonesKey } from "./use-get-milestones";
export const milestoneCandidatesKey = (projectId: string, featureId: string) =>
  [...milestonesKey(projectId, featureId), "task-candidates"] as const;
export function useMilestoneCandidates(projectId: string, featureId: string) {
  return useQuery({
    queryKey: milestoneCandidatesKey(projectId, featureId),
    queryFn: ({ signal }) =>
      getMilestoneCandidates(projectId, featureId, signal),
    enabled: Boolean(projectId && featureId),
    staleTime: 30_000,
    refetchOnMount: "always",
  });
}
