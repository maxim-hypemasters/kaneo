import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getTimeOffBalance } from "@/fetchers/time-off/get-time-off-balance";
import { timeOffBalanceKey } from "./time-off-keys";

type Options = { userId?: string; enabled?: boolean };

// One member's balance for a Jan-Dec year; your own without a userId.
export function useTimeOffBalance(
  workspaceId: string,
  year: number,
  { userId, enabled = true }: Options = {},
) {
  return useQuery({
    queryKey: timeOffBalanceKey(workspaceId, year, userId),
    queryFn: () => getTimeOffBalance(workspaceId, year, userId),
    enabled: Boolean(workspaceId) && enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
