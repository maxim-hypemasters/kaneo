import { useQuery } from "@tanstack/react-query";
import { getMilestones } from "@/fetchers/milestone/milestones";
export const milestonesKey = (projectId: string, featureId?: string) =>
  featureId === undefined
    ? (["feature-milestones", projectId] as const)
    : (["feature-milestones", projectId, featureId] as const);
export function useGetMilestones(
  projectId: string,
  featureId: string | null | undefined,
) {
  return useQuery({
    queryKey: milestonesKey(projectId, featureId ?? ""),
    queryFn: () => getMilestones(featureId ?? ""),
    enabled: Boolean(projectId && featureId),
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
