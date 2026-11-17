import { timeOffHolidayCalendarTable } from "../../database/schema";
import type { TimeOffTransaction } from "../access";
import type { HolidayCalendarCode } from "./catalog";

// Records a member's calendar; null records "No calendar", so the row stays
// and their free first choice stays used. Call under the member lock.
export async function writeHolidayCalendar(
  tx: TimeOffTransaction,
  workspaceId: string,
  userId: string,
  calendar: HolidayCalendarCode | null,
) {
  const values = {
    country: calendar?.country ?? null,
    region: calendar?.region ?? null,
  };
  await tx
    .insert(timeOffHolidayCalendarTable)
    .values({ workspaceId, userId, ...values })
    .onConflictDoUpdate({
      target: [
        timeOffHolidayCalendarTable.workspaceId,
        timeOffHolidayCalendarTable.userId,
      ],
      set: { ...values, updatedAt: new Date() },
    });
}
