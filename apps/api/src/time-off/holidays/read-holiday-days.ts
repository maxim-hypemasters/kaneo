import type { Reader } from "../access";
import { type HolidayDays, toHolidayDays, yearsWindow } from "./holiday-days";
import { readMemberHolidays } from "./read-member-holidays";

// Calendar holidays of current members over whole Jan-Dec years, from the
// first year to the last. Day counts and balances need every holiday of the
// years a range touches, never just those of a query window.
export async function readHolidayDays(
  reader: Reader,
  workspaceId: string,
  userIds: readonly string[],
  years: readonly number[],
): Promise<HolidayDays> {
  if (userIds.length === 0 || years.length === 0) return new Map();
  const { byUser } = await readMemberHolidays(
    reader,
    workspaceId,
    userIds,
    yearsWindow(years),
  );
  return toHolidayDays(byUser);
}
