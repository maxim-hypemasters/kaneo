import { useQuery } from "@tanstack/react-query";
import getReleaseMilestones from "@/fetchers/release/get-release-milestones";
import { milestonesKey } from "@/hooks/queries/milestone/use-get-milestones";

export const releaseMilestonesKey = (
  projectId: string,
  releaseId: string | null | undefined,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) => [...milestonesKey(projectId), "release", releaseId, timeZone] as const;

export function useGetReleaseMilestones(
  projectId: string,
  releaseId: string | null | undefined,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  return useQuery({
    queryKey: releaseMilestonesKey(projectId, releaseId, timeZone),
    queryFn: () => getReleaseMilestones(releaseId ?? "", timeZone),
    enabled: Boolean(projectId && releaseId),
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
