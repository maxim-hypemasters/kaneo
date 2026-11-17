// The calendar rows that give holidays. A null country records an explicit
// "No calendar", which must read exactly like having no row: no holidays, no
// entry per member and no part in the plan revision.
export function appliedHolidayCalendars<T extends { country: string | null }>(
  rows: readonly T[],
): Array<T & { country: string }> {
  return rows.filter(
    (row): row is T & { country: string } => row.country !== null,
  );
}
