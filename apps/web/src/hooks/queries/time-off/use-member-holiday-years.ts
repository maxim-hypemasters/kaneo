import { useQueries } from "@tanstack/react-query";
import { getMemberHolidays } from "@/fetchers/time-off/get-member-holidays";
import type { MemberHolidays } from "@/fetchers/time-off/types";
import { timeOffHolidaysKey } from "./time-off-keys";

type Options = { userId?: string; lang?: string; enabled?: boolean };

export type MemberHolidayYears = {
  // Every holiday date (YYYY-MM-DD) of the loaded years, weekends included.
  days: ReadonlySet<string>;
  isPending: boolean;
  isError: boolean;
};

// One member's holiday dates over several years, e.g. every year a draft
// request touches. Shares cache entries with useMemberHolidays.
export function useMemberHolidayYears(
  workspaceId: string,
  years: readonly number[],
  { userId, lang, enabled = true }: Options = {},
): MemberHolidayYears {
  return useQueries({
    queries: years.map((year) => ({
      queryKey: timeOffHolidaysKey(workspaceId, year, userId, lang),
      queryFn: () => getMemberHolidays(workspaceId, year, { userId, lang }),
      enabled: Boolean(workspaceId) && enabled,
      staleTime: 60_000,
      refetchOnMount: true,
    })),
    combine: (results) => ({
      days: new Set(
        results.flatMap((result) =>
          result.data
            ? (result.data as MemberHolidays).holidays.map(({ date }) => date)
            : [],
        ),
      ),
      isPending: enabled && results.some((result) => result.isPending),
      isError: results.some((result) => result.isError),
    }),
  });
}
