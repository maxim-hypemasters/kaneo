const DAY = /^\d{4}-\d{2}-\d{2}$/;

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

// The UTC midnight of a real YYYY-MM-DD day, or null.
function parseDay(value: string) {
  if (!DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().startsWith(value) ? date : null;
}

// An inclusive range of YYYY-MM-DD days as English text for email and push
// messages, such as "Nov 16 – 20, 2026". Returns null for anything that is
// not a valid range, since event data can come from integrations.
export function formatDayRange(startDate: string, endDate: string) {
  const start = parseDay(startDate);
  const end = parseDay(endDate);
  if (!start || !end || start > end) return null;
  // ICU puts thin spaces around the dash; plain spaces read the same in
  // every mail and push client.
  return formatter.formatRange(start, end).replace(/ /gu, " ");
}
