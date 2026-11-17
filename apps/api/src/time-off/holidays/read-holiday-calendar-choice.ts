import { and, eq } from "drizzle-orm";
import { timeOffHolidayCalendarTable } from "../../database/schema";
import { heldByCurrentMember, type Reader } from "../access";
import type { HolidayCalendarCode } from "./catalog";
import { holidayCalendarCode } from "./holiday-calendar-code";

export type HolidayCalendarChoice = {
  // Any row, "No calendar" included, uses up the member's free first choice.
  chosen: boolean;
  calendar: HolidayCalendarCode | null;
};

// A current member's calendar choice. Runs only on `reader`, so it is safe
// inside a transaction.
export async function readHolidayCalendarChoice(
  reader: Reader,
  workspaceId: string,
  userId: string,
): Promise<HolidayCalendarChoice> {
  const [row] = await reader
    .select({
      country: timeOffHolidayCalendarTable.country,
      region: timeOffHolidayCalendarTable.region,
    })
    .from(timeOffHolidayCalendarTable)
    .where(
      and(
        eq(timeOffHolidayCalendarTable.workspaceId, workspaceId),
        eq(timeOffHolidayCalendarTable.userId, userId),
        heldByCurrentMember(timeOffHolidayCalendarTable, reader),
      ),
    );
  return row
    ? { chosen: true, calendar: holidayCalendarCode(row) }
    : { chosen: false, calendar: null };
}
