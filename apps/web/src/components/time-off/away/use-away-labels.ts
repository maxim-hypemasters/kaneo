import { useQuery } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getTimeOffCalendar } from "@/fetchers/time-off/get-time-off-calendar";
import type { TimeOffCalendar } from "@/fetchers/time-off/types";
import { timeOffAwayKey } from "@/hooks/queries/time-off/time-off-keys";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import {
  formatReleaseDate,
  parseReleaseDate,
  toReleaseDate,
} from "@/lib/releases/release-date";
import { useReleaseToday } from "@/lib/releases/use-release-today";
import { awayUntilByUser } from "@/lib/time-off/away-until-by-user";
import { useTimeOffFormatLocale } from "../use-time-off-format-locale";

// How far ahead a stretch of time off is followed to find its last day.
export const AWAY_WINDOW_DAYS = 60;

const NO_ONE_AWAY: ReadonlyMap<string, string> = new Map();

// userId -> "Away until Nov 20" for members away today (the viewer's local
// day). Loads only while `enabled` (a picker is open, or the page shows the
// badges) and the viewer may read time off, so boards fetch nothing.
export function useAwayLabels(
  workspaceId: string,
  { enabled }: { enabled: boolean },
): ReadonlyMap<string, string> {
  const { t } = useTranslation();
  const locale = useTimeOffFormatLocale();
  const { canReadTimeOff, isCheckingPermissions } = useWorkspacePermission();
  const today = useReleaseToday();
  const to = toReleaseDate(addDays(parseReleaseDate(today), AWAY_WINDOW_DAYS));
  const allowed = !isCheckingPermissions && canReadTimeOff();
  const select = useCallback(
    (calendar: TimeOffCalendar) => awayUntilByUser(calendar.entries, today),
    [today],
  );
  const { data } = useQuery({
    queryKey: timeOffAwayKey(workspaceId, today, to),
    queryFn: () => getTimeOffCalendar(workspaceId, today, to),
    enabled: enabled && allowed && Boolean(workspaceId),
    staleTime: 60_000,
    refetchOnMount: true,
    select,
  });

  return useMemo(() => {
    if (!allowed || !data?.size) return NO_ONE_AWAY;
    const labels = new Map<string, string>();
    for (const [userId, until] of data) {
      labels.set(
        userId,
        t("team:timeOff.away.until", {
          date: formatReleaseDate(until, { today, locale }),
        }),
      );
    }
    return labels;
  }, [allowed, data, t, today, locale]);
}
