import { useQuery } from "@tanstack/react-query";
import { getProjectMilestones } from "@/fetchers/milestone/milestones";
import { milestonesKey } from "./use-get-milestones";
export function useGetProjectMilestones(projectId: string) {
  return useQuery({
    queryKey: [...milestonesKey(projectId), "project"],
    queryFn: () => getProjectMilestones(projectId),
    enabled: Boolean(projectId),
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
