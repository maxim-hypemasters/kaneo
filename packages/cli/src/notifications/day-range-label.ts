const DAY = /^\d{4}-\d{2}-\d{2}$/u;

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

function parseDay(value: string | null): Date | null {
  if (!value || !DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().startsWith(value) ? date : null;
}

// An inclusive range of YYYY-MM-DD days, such as "Nov 16 – 20, 2026", or null
// when either end is missing or invalid.
export function dayRangeLabel(
  startDate: string | null,
  endDate: string | null,
): string | null {
  const start = parseDay(startDate);
  const end = parseDay(endDate);
  if (!start || !end || start > end) return null;
  return formatter.formatRange(start, end).replace(/ /gu, " ");
}
