import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getTimeOffBalances } from "@/fetchers/time-off/get-time-off-balances";
import { timeOffBalancesKey } from "./time-off-keys";

// Every member's balance for a year. Needs time_off:approve; pass enabled
// only for approvers.
export function useTimeOffBalances(
  workspaceId: string,
  year: number,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: timeOffBalancesKey(workspaceId, year),
    queryFn: () => getTimeOffBalances(workspaceId, year),
    enabled: Boolean(workspaceId) && enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
