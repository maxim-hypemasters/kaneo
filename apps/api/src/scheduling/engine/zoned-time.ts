const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let value = formatters.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, value);
  }
  return value;
}

function wallTime(epoch: number, timeZone: string) {
  const values = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(epoch)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return Date.UTC(
    values.year!,
    values.month! - 1,
    values.day!,
    values.hour!,
    values.minute!,
    values.second!,
  );
}

function offset(epoch: number, timeZone: string) {
  const seconds = Math.floor(epoch / 1000) * 1000;
  return wallTime(seconds, timeZone) - seconds;
}

export function localDate(epoch: number, timeZone: string) {
  return new Date(wallTime(epoch, timeZone)).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export type TimeInterval = { start: number; end: number };

// Intersect wall-clock intervals with constant-offset UTC periods. This omits
// nonexistent spring hours and includes both copies of repeated autumn hours.
export function localInterval(
  date: string,
  startMinute: number,
  endMinute: number,
  timeZone: string,
): TimeInterval[] {
  const midnight = Date.parse(`${date}T00:00:00Z`);
  const wallStart = midnight + startMinute * 60_000;
  const wallEnd = midnight + endMinute * 60_000;
  const rangeStart = midnight - 2 * DAY_MS;
  const rangeEnd = midnight + 3 * DAY_MS;
  const periods: { start: number; end: number; offset: number }[] = [];
  let periodStart = rangeStart;
  let previousTime = rangeStart;
  let previousOffset = offset(rangeStart, timeZone);
  for (
    let sample = rangeStart + 6 * 3_600_000;
    sample <= rangeEnd;
    sample += 6 * 3_600_000
  ) {
    const nextOffset = offset(sample, timeZone);
    if (nextOffset !== previousOffset) {
      let low = previousTime;
      let high = sample;
      while (high - low > 1000) {
        const middle = Math.floor((low + high) / 2000) * 1000;
        if (offset(middle, timeZone) === previousOffset) low = middle;
        else high = middle;
      }
      periods.push({ start: periodStart, end: high, offset: previousOffset });
      periodStart = high;
      previousOffset = nextOffset;
    }
    previousTime = sample;
  }
  periods.push({ start: periodStart, end: rangeEnd, offset: previousOffset });
  return periods.flatMap((period) => {
    const start = Math.max(period.start, wallStart - period.offset);
    const end = Math.min(period.end, wallEnd - period.offset);
    return start < end ? [{ start, end }] : [];
  });
}

export function startOfLocalDay(date: string, timeZone: string) {
  // A skipped civil date has the same boundary as the following civil date.
  for (let day = 0; day < 3; day++) {
    const intervals = localInterval(addDays(date, day), 0, 1440, timeZone);
    if (intervals.length) return intervals[0]!.start;
  }
  throw new Error("Cannot resolve local date boundary");
}
