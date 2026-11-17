import {
  addDays,
  endOfMonth,
  startOfDay,
  startOfMonth,
  subDays,
} from "date-fns";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BlockedDays } from "@/components/common/date-picker/blocked-days";
import { formatPickerDay } from "@/components/common/date-picker/quick-date-labels";
import { useAwayDays } from "@/hooks/queries/time-off/use-away-days";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toReleaseDate } from "@/lib/releases/release-date";

type Assignee = { userId: string | null; name: string | null };

// The days a task's assignee is away (approved time off and public
// holidays), for a date picker: a task can't start or be due on one.
// Undefined for unassigned work, or when the viewer may not read time off;
// nothing is blocked while the days load. Shares the Gantt's year cache, so
// mount it only while the picker is open.
export function useAssigneeBlockedDays(
  { userId, name }: Assignee,
  anchor: Date | null,
): BlockedDays | undefined {
  const { t } = useTranslation();
  const { workspace, canReadTimeOff, isCheckingPermissions } =
    useWorkspacePermission();
  const allowed = Boolean(userId) && !isCheckingPermissions && canReadTimeOff();
  const [month, setMonth] = useState(() => startOfMonth(anchor ?? new Date()));
  // The shown month's grid (with the days around it), and the quick dates'
  // reach from today (next week). Not the years between: a task due decades
  // away would load every one of them.
  const today = startOfDay(new Date());
  const monthFrom = toReleaseDate(subDays(month, 7));
  const monthTo = toReleaseDate(addDays(endOfMonth(month), 14));
  const todayFrom = toReleaseDate(subDays(today, 7));
  const todayTo = toReleaseDate(addDays(today, 14));
  const windows = useMemo(
    () =>
      allowed
        ? [
            { from: monthFrom, to: monthTo },
            { from: todayFrom, to: todayTo },
          ]
        : [],
    [allowed, monthFrom, monthTo, todayFrom, todayTo],
  );
  const { byUser } = useAwayDays(workspace?.id, windows);
  const days = userId ? byUser.get(userId) : undefined;

  return useMemo(() => {
    if (!allowed) return undefined;
    const who = name?.trim() || t("common:people.unknown");
    const nearby = days
      ? [...days.keys()].some((day) =>
          windows.some(({ from, to }) => day >= from && day <= to),
        )
      : false;
    return {
      isBlocked: (day: Date) => days?.has(toReleaseDate(day)) ?? false,
      describe: (day: Date) =>
        t("tasks:datePicker.assigneeAway", {
          name: who,
          date: formatPickerDay(day),
        }),
      hint: nearby ? t("tasks:datePicker.awayHint", { name: who }) : undefined,
      onMonthChange: (shown: Date) => setMonth(startOfMonth(shown)),
    };
  }, [allowed, days, windows, name, t]);
}
