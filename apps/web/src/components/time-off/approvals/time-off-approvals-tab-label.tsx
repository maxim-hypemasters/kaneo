import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { useHolidayCalendarRequests } from "@/hooks/queries/time-off/use-holiday-calendar-requests";
import { usePendingTimeOffRequests } from "@/hooks/queries/time-off/use-pending-time-off-requests";
import { useTimeOffFormatLocale } from "../use-time-off-format-locale";

type TimeOffApprovalsTabLabelProps = {
  workspaceId: string;
  // Only approvers can read the pending list.
  enabled: boolean;
};

// "Approvals" with the number of time off requests and calendar changes
// waiting. It shares both queries, language included, with the Approvals tab,
// so opening the tab fetches nothing new.
export function TimeOffApprovalsTabLabel({
  workspaceId,
  enabled,
}: TimeOffApprovalsTabLabelProps) {
  const { t } = useTranslation();
  const lang = useTimeOffFormatLocale();
  const pending = usePendingTimeOffRequests(workspaceId, { enabled });
  const calendars = useHolidayCalendarRequests(workspaceId, lang, { enabled });
  const count =
    (pending.data?.requests.length ?? 0) +
    (calendars.data?.requests.length ?? 0);
  const label = t("team:timeOff.views.approvals");

  if (count === 0) return label;

  return (
    <>
      <span aria-hidden="true" className="flex items-center gap-1.5">
        {label}
        <Badge variant="warning" size="sm" className="tabular-nums">
          {count}
        </Badge>
      </span>
      <span className="sr-only">
        {t("team:timeOff.approvals.tabLabel", { count })}
      </span>
    </>
  );
}
