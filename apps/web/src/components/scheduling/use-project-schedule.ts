import { useQuery } from "@tanstack/react-query";
import { getProjectSchedule, projectScheduleKey } from "./project-schedule";

export function useGetProjectSchedule(projectId: string) {
  return useQuery({
    queryKey: projectScheduleKey(projectId),
    queryFn: () => getProjectSchedule(projectId),
    enabled: Boolean(projectId),
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
