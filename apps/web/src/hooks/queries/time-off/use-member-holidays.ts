import { useQuery } from "@tanstack/react-query";
import { getMemberHolidays } from "@/fetchers/time-off/get-member-holidays";
import { timeOffHolidaysKey } from "./time-off-keys";

type Options = { userId?: string; lang?: string; enabled?: boolean };

// One member's calendar and its holidays for a Jan-Dec year; your own
// without a userId. Shares cache entries with useMemberHolidayYears.
export function useMemberHolidays(
  workspaceId: string,
  year: number,
  { userId, lang, enabled = true }: Options = {},
) {
  return useQuery({
    queryKey: timeOffHolidaysKey(workspaceId, year, userId, lang),
    queryFn: () => getMemberHolidays(workspaceId, year, { userId, lang }),
    enabled: Boolean(workspaceId) && enabled,
    staleTime: 60_000,
    refetchOnMount: true,
  });
}
