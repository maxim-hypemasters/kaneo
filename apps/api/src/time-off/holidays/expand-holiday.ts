const DAY_MS = 86_400_000;

// The civil days one date-holidays entry covers. `date` is its local start
// ("YYYY-MM-DD hh:mm:ss", maybe with an offset); `start` and `end` are
// instants, so they never name the local day themselves. Rounding the span
// from local midnight copes with 23 and 25 hour DST days and with holidays
// that start in the afternoon.
export function holidayDates(holiday: {
  date: string;
  start: Date;
  end: Date;
}): string[] {
  const [hours = 0, minutes = 0, seconds = 0] = holiday.date
    .slice(11, 19)
    .split(":")
    .map(Number);
  const startOfDay =
    holiday.start.getTime() - ((hours * 60 + minutes) * 60 + seconds) * 1000;
  const days = Math.max(
    1,
    Math.round((holiday.end.getTime() - startOfDay) / DAY_MS),
  );
  const first = Date.parse(`${holiday.date.slice(0, 10)}T00:00:00Z`);
  return Array.from({ length: days }, (_, offset) =>
    new Date(first + offset * DAY_MS).toISOString().slice(0, 10),
  );
}
