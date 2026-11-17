import type { HolidayCalendarCode } from "./catalog";

// A stored calendar or calendar request as codes; a null country is "No
// calendar".
export function holidayCalendarCode(row: {
  country: string | null;
  region: string | null;
}): HolidayCalendarCode | null {
  return row.country === null
    ? null
    : { country: row.country, region: row.region };
}
