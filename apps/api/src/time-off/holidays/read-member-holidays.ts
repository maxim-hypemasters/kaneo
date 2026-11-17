import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { timeOffHolidayCalendarTable } from "../../database/schema";
import { heldByCurrentMember, type Reader } from "../access";
import { appliedHolidayCalendars } from "./applied-holiday-calendars";
import { holidayRevision } from "./holiday-revision";
import { type MemberHoliday, resolveHolidays } from "./resolve-holidays";

export type MemberHolidays = {
  // Each current member with a calendar: their holidays in the window.
  byUser: Map<string, MemberHoliday[]>;
  // Undefined when nobody has a calendar.
  revision: string | undefined;
};

// Calendar public holidays of current members in [from, to]; null user ids
// means every member. "No calendar" rows count as no row. Every query, the
// membership check included, runs on `reader`, so callers inside a
// transaction never take a second connection.
export async function readMemberHolidays(
  reader: Reader,
  workspaceId: string,
  userIds: readonly string[] | null,
  window: { from: string; to: string },
  lang = "en",
): Promise<MemberHolidays> {
  if (userIds?.length === 0) return { byUser: new Map(), revision: undefined };
  const rows = await reader
    .select({
      userId: timeOffHolidayCalendarTable.userId,
      country: timeOffHolidayCalendarTable.country,
      region: timeOffHolidayCalendarTable.region,
    })
    .from(timeOffHolidayCalendarTable)
    .where(
      and(
        eq(timeOffHolidayCalendarTable.workspaceId, workspaceId),
        isNotNull(timeOffHolidayCalendarTable.country),
        userIds
          ? inArray(timeOffHolidayCalendarTable.userId, [...userIds])
          : undefined,
        heldByCurrentMember(timeOffHolidayCalendarTable, reader),
      ),
    )
    .orderBy(asc(timeOffHolidayCalendarTable.userId));
  const calendars = appliedHolidayCalendars(rows);

  const { from, to } = window;
  const byUser = new Map<string, MemberHoliday[]>();
  for (const calendar of calendars) {
    const holidays: MemberHoliday[] = [];
    for (
      let year = Number(from.slice(0, 4));
      year <= Number(to.slice(0, 4));
      year++
    ) {
      for (const holiday of resolveHolidays(calendar, year, lang)) {
        if (holiday.date >= from && holiday.date <= to) holidays.push(holiday);
      }
    }
    byUser.set(calendar.userId, holidays);
  }
  return { byUser, revision: holidayRevision(calendars) };
}
