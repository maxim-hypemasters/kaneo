import type { timeOffHolidayCalendarRequestTable } from "../../../database/schema";
import { holidayCalendarCode } from "../holiday-calendar-code";
import { presentHolidayCalendar } from "../present-holiday-calendar";

export type HolidayCalendarRequestRow =
  typeof timeOffHolidayCalendarRequestTable.$inferSelect;

// Fields are listed one by one so a new column never reaches a response by
// accident. Names the calendar asked for, so it goes only to the member and
// approvers. updatedAt moves with each resubmission.
export function presentHolidayCalendarRequest(
  row: HolidayCalendarRequestRow,
  lang?: string,
) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    status: row.status,
    version: row.version,
    calendar: presentHolidayCalendar(holidayCalendarCode(row), lang),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
