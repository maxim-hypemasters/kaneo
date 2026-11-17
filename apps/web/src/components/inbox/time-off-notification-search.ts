import { toMonthParam } from "@/lib/time-off/time-off-month";
import type { TimeOffView } from "@/lib/time-off/time-off-view";
import type { TimeOffNotificationType } from "./time-off-notification-type";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Where "Open time off" lands: approvers go to Approvals, the requester to
// their own requests in that year (holiday calendar decisions carry no date),
// everyone else to the Team month.
export function timeOffNotificationSearch(
  type: TimeOffNotificationType,
  startDate: unknown,
): { view: TimeOffView; month?: string } {
  if (
    type === "time_off_requested" ||
    type === "time_off_holiday_calendar_requested"
  )
    return { view: "approvals" };
  const month =
    typeof startDate === "string" && ISO_DAY.test(startDate)
      ? toMonthParam(startDate)
      : undefined;
  const view = type === "time_off_member_away" ? "team" : "mine";
  return month ? { view, month } : { view };
}
