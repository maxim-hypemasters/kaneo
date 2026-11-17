import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import { useTimeOffFormatLocale } from "@/components/time-off/use-time-off-format-locale";
import { getTimeOffCalendar } from "@/fetchers/time-off/get-time-off-calendar";
import type { TimeOffCalendar } from "@/fetchers/time-off/types";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { type AwayDaysByUser, awayDaysByUser } from "@/lib/time-off/away-days";
import { rangeYears } from "@/lib/time-off/range-years";
import { yearWindow } from "@/lib/time-off/year-window";
import { timeOffYearKey } from "./time-off-keys";

// Kept a few minutes: TIME_OFF_UPDATED refetches a year while something
// shows it, so opening a picker needn't. A year invalidated while nothing
// showed it refetches when it mounts again (refetchOnMount).
const STALE_MS = 5 * 60_000;

// Inclusive days (YYYY-MM-DD).
export type DayWindow = { from: string; to: string };

export type AwayDays = {
  byUser: AwayDaysByUser;
  isPending: boolean;
  isError: boolean;
  retry: () => void;
};

function combine(results: UseQueryResult<TimeOffCalendar>[]): AwayDays {
  return {
    byUser: awayDaysByUser(results.flatMap(({ data }) => (data ? [data] : []))),
    isPending: results.some((result) => result.isPending),
    isError: results.some((result) => result.isError),
    retry: () => {
      for (const result of results) if (result.isError) void result.refetch();
    },
  };
}

// Who is away on which days within the windows, loaded a whole calendar
// year at a time (each year any window touches, once) so the Gantt and the
// date pickers share entries. Nothing loads without a window or while the
// viewer may not read time off.
export function useAwayDays(
  workspaceId: string | undefined,
  windows: readonly DayWindow[],
): AwayDays {
  const { canReadTimeOff, isCheckingPermissions } = useWorkspacePermission();
  const lang = useTimeOffFormatLocale();
  const years =
    workspaceId && windows.length && !isCheckingPermissions && canReadTimeOff()
      ? [
          ...new Set(windows.flatMap(({ from, to }) => rangeYears(from, to))),
        ].sort((a, b) => a - b)
      : [];
  return useQueries({
    queries: years.map((year) => ({
      queryKey: timeOffYearKey(workspaceId ?? "", year, lang),
      queryFn: () => {
        const { from, to } = yearWindow(year);
        return getTimeOffCalendar(workspaceId ?? "", from, to, lang);
      },
      staleTime: STALE_MS,
      refetchOnMount: true,
    })),
    combine,
  });
}
