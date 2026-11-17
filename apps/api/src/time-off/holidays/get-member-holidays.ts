import db from "../../database";
import { assertWorkspaceMember } from "../access";
import { readHolidayCalendarDeadline } from "../settings/read-holiday-calendar-deadline";
import { assertCanViewMember, type TimeOffViewer } from "../viewer";
import { holidayCalendarChangeMode } from "./holiday-calendar-change-mode";
import { presentHolidayCalendar } from "./present-holiday-calendar";
import { readHolidayCalendarChoice } from "./read-holiday-calendar-choice";
import { presentHolidayCalendarRequest } from "./requests/present-holiday-calendar-request";
import { readPendingHolidayCalendarRequest } from "./requests/read-pending-holiday-calendar-request";
import { resolveHolidays } from "./resolve-holidays";

// A member's calendar, its holidays for one year with names, and where their
// calendar choice stands. Your own always reads; another member's needs
// approve and a current member.
export async function getMemberHolidays(
  viewer: TimeOffViewer,
  query: { userId?: string; year?: number; lang?: string },
) {
  const userId = query.userId ?? viewer.userId;
  assertCanViewMember(viewer, userId);
  if (userId !== viewer.userId)
    await assertWorkspaceMember(db, viewer.workspaceId, userId);
  const year = query.year ?? Number(viewer.today.slice(0, 4));
  const [choice, pending, deadline] = await Promise.all([
    readHolidayCalendarChoice(db, viewer.workspaceId, userId),
    readPendingHolidayCalendarRequest(db, viewer.workspaceId, userId),
    readHolidayCalendarDeadline(db, viewer.workspaceId),
  ]);
  const mode = holidayCalendarChangeMode({
    forSelf: userId === viewer.userId,
    canApprove: viewer.canApprove,
    chosen: choice.chosen,
    deadline,
    today: viewer.today,
  });
  const { calendar } = choice;
  return {
    workspaceId: viewer.workspaceId,
    userId,
    year,
    calendar: presentHolidayCalendar(calendar, query.lang),
    calendarChosen: choice.chosen,
    pendingRequest: pending
      ? presentHolidayCalendarRequest(pending, query.lang)
      : null,
    holidayCalendarDeadline: deadline,
    nextChangeNeedsApproval: mode === "request",
    holidays: calendar ? [...resolveHolidays(calendar, year, query.lang)] : [],
  };
}
