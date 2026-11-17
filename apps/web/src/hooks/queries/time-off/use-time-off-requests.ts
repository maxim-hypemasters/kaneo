import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getTimeOffRequests } from "@/fetchers/time-off/get-time-off-requests";
import { timeOffRequestsKey } from "./time-off-keys";

type Options = { userId?: string; enabled?: boolean };

// A member's requests of every status that touch the year; your own without
// a userId.
export function useTimeOffRequests(
  workspaceId: string,
  year: number,
  { userId, enabled = true }: Options = {},
) {
  return useQuery({
    queryKey: timeOffRequestsKey(workspaceId, year, userId),
    queryFn: () => getTimeOffRequests(workspaceId, year, userId),
    enabled: Boolean(workspaceId) && enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
