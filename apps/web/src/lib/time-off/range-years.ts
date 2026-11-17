// Every Jan-Dec year from the start day's to the end day's (YYYY-MM-DD),
// ascending; none when the start is after the end.
export function rangeYears(startDate: string, endDate: string): number[] {
  const years: number[] = [];
  const last = Number(endDate.slice(0, 4));
  for (let year = Number(startDate.slice(0, 4)); year <= last; year++) {
    years.push(year);
  }
  return startDate > endDate ? [] : years;
}
