import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import getReleaseProgress from "@/fetchers/release/get-release-progress";
import { useLocalDay } from "@/hooks/use-local-day";

export function releaseProgressKey(projectId: string) {
  return ["release-progress", projectId] as const;
}

export function useGetReleaseProgress(
  projectId: string,
  releaseId: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const day = useLocalDay();
  const previousDay = useRef(day);
  const query = useQuery({
    queryKey: [...releaseProgressKey(projectId), releaseId, timeZone],
    queryFn: () => getReleaseProgress(releaseId, timeZone),
    enabled: !!projectId && !!releaseId,
    staleTime: 60_000,
    refetchOnMount: true,
  });
  const { refetch } = query;

  useEffect(() => {
    if (previousDay.current === day) return;
    previousDay.current = day;
    void refetch();
  }, [day, refetch]);

  return query;
}
