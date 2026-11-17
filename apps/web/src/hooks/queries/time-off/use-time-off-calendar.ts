import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getTimeOffCalendar } from "@/fetchers/time-off/get-time-off-calendar";
import type { TimeOffCalendar } from "@/fetchers/time-off/types";
import { timeOffCalendarKey } from "./time-off-keys";

type Options<T> = {
  enabled?: boolean;
  // The language of the holiday names the viewer may see.
  lang?: string;
  select?: (calendar: TimeOffCalendar) => T;
};

// Who is away between two days (YYYY-MM-DD, inclusive), with members'
// public holidays. The previous window stays on screen while the next month
// loads.
export function useTimeOffCalendar<T = TimeOffCalendar>(
  workspaceId: string,
  from: string,
  to: string,
  { enabled = true, lang, select }: Options<T> = {},
) {
  return useQuery({
    queryKey: timeOffCalendarKey(workspaceId, from, to, lang),
    queryFn: () => getTimeOffCalendar(workspaceId, from, to, lang),
    enabled: Boolean(workspaceId) && enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnMount: true,
    select,
  });
}
