type CalendarCodes = { country: string | null; region?: string | null };

// Whether two choices name the same calendar. Null, or a null country, is
// No calendar, whatever the region says.
export function sameHolidayCalendar(
  a: CalendarCodes | null,
  b: CalendarCodes | null,
) {
  const country = a?.country ?? null;
  if (country !== (b?.country ?? null)) return false;
  return country === null || (a?.region ?? null) === (b?.region ?? null);
}
