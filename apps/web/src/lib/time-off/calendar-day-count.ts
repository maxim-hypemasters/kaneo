const DAY_MS = 86_400_000;

// Inclusive count of calendar days between two YYYY-MM-DD strings, or 0 when
// the start is after the end. Date-only strings parse as UTC midnight, so no
// time zone shifts a day.
export function calendarDayCount(startDate: string, endDate: string) {
  return Math.max(
    0,
    Math.round((Date.parse(endDate) - Date.parse(startDate)) / DAY_MS) + 1,
  );
}
