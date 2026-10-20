import { useQuery } from "@tanstack/react-query";
import getReleaseMilestones from "@/fetchers/release/get-release-milestones";
import { milestonesKey } from "@/hooks/queries/milestone/use-get-milestones";

export const releaseMilestonesKey = (
  projectId: string,
  releaseId: string | null | undefined,
) => [...milestonesKey(projectId), "release", releaseId] as const;

export function useGetReleaseMilestones(
  projectId: string,
  releaseId: string | null | undefined,
) {
  return useQuery({
    queryKey: releaseMilestonesKey(projectId, releaseId),
    queryFn: () => getReleaseMilestones(releaseId ?? ""),
    enabled: Boolean(projectId && releaseId),
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
