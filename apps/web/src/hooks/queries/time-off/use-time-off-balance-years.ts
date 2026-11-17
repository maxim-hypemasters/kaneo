import { useQueries } from "@tanstack/react-query";
import { getTimeOffBalance } from "@/fetchers/time-off/get-time-off-balance";
import type { TimeOffBalance } from "@/fetchers/time-off/types";
import { timeOffBalanceKey } from "./time-off-keys";

type Options = { userId?: string; enabled?: boolean };

// One member's balances for several years, e.g. every year a draft request
// touches. Shares cache entries with useTimeOffBalance.
export function useTimeOffBalanceYears(
  workspaceId: string,
  years: readonly number[],
  { userId, enabled = true }: Options = {},
) {
  return useQueries({
    queries: years.map((year) => ({
      queryKey: timeOffBalanceKey(workspaceId, year, userId),
      queryFn: () => getTimeOffBalance(workspaceId, year, userId),
      enabled: Boolean(workspaceId) && enabled,
      staleTime: 30_000,
      refetchOnMount: true,
    })),
    combine: (results) => ({
      balances: results.flatMap((result) =>
        result.data ? [result.data as TimeOffBalance] : [],
      ),
      isPending: results.some((result) => result.isPending),
      isError: results.some((result) => result.isError),
    }),
  });
}
