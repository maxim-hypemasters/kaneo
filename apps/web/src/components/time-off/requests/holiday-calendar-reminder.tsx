import { CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useMemberHolidays } from "@/hooks/queries/time-off/use-member-holidays";
import { formatReleaseDate } from "@/lib/releases/release-date";
import { useTimeOffFormatLocale } from "../use-time-off-format-locale";

type HolidayCalendarReminderProps = {
  workspaceId: string;
  year: number;
  // The viewer's local day, YYYY-MM-DD.
  today: string;
  // Choosing your own calendar needs time_off:create.
  canEdit: boolean;
  // Approvers' own changes always apply at once (time_off:approve).
  canApprove: boolean;
  className?: string;
};

// Reminds members without a calendar choice of the workspace's deadline. It
// reads the holiday card's query, so it fetches nothing of its own, and the
// server's flag says whether choosing now needs approval.
export function HolidayCalendarReminder({
  workspaceId,
  year,
  today,
  canEdit,
  canApprove,
  className,
}: HolidayCalendarReminderProps) {
  const { t } = useTranslation();
  const lang = useTimeOffFormatLocale();
  const { data } = useMemberHolidays(workspaceId, year, { lang });
  const deadline = data?.holidayCalendarDeadline;

  if (!canEdit || !data || data.calendarChosen || data.pendingRequest)
    return null;
  if (!deadline) return null;
  const passed = data.nextChangeNeedsApproval;
  // An approver's choice always applies, so once the day is gone there is
  // nothing to remind them of. The server counts days in UTC, so a member
  // ahead of UTC still has the deadline day after their own midnight.
  if (!passed && deadline < new Date().toISOString().slice(0, 10)) return null;

  return (
    <Alert
      variant={passed ? "warning" : "info"}
      role="status"
      className={className}
    >
      <CalendarClock aria-hidden="true" />
      <AlertTitle>
        {passed
          ? t("team:timeOff.holidays.reminderPassed")
          : t("team:timeOff.holidays.reminder", {
              date: formatReleaseDate(deadline, { today }),
            })}
      </AlertTitle>
      <AlertDescription>
        {t(
          passed
            ? "team:timeOff.holidays.reminderPassedHint"
            : canApprove
              ? "team:timeOff.holidays.reminderApproverHint"
              : "team:timeOff.holidays.reminderHint",
        )}
      </AlertDescription>
    </Alert>
  );
}
