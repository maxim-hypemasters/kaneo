import { addDays, differenceInCalendarDays } from "date-fns";

// With weekends hidden the timeline renders only Monday to Friday, so a day's
// column is no longer its calendar offset from the first rendered day. These
// helpers translate between dates and columns; with `hideWeekends` false every
// column is simply a calendar day, so callers need no separate path.

export function isWeekendDay(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// Days since Monday, 0-6.
function mondayOffset(date: Date) {
  return (date.getDay() + 6) % 7;
}

// Working days from Monday up to the day at `position` (days since a Monday,
// may be negative).
function workingDaysBefore(position: number) {
  const week = Math.floor(position / 7);
  return week * 5 + Math.min(position - week * 7, 5);
}

// The column of `date`: how many rendered days come before it, counted from
// `rangeStart`. A hidden weekend day has no column of its own and takes the
// next working day's, so spans starting on it begin there. Dates before
// `rangeStart` are negative.
export function dayColumn(date: Date, rangeStart: Date, hideWeekends = false) {
  const days = differenceInCalendarDays(date, rangeStart);
  if (!hideWeekends) return days;
  const offset = mondayOffset(rangeStart);
  return workingDaysBefore(offset + days) - workingDaysBefore(offset);
}

// The date of a column, the inverse of `dayColumn` for working days.
export function columnDay(
  rangeStart: Date,
  column: number,
  hideWeekends = false,
) {
  if (!hideWeekends) return addDays(rangeStart, column);
  const offset = mondayOffset(rangeStart);
  const working = column + workingDaysBefore(offset);
  const week = Math.floor(working / 5);
  return addDays(rangeStart, week * 7 + (working - week * 5) - offset);
}

// `date` moved by whole working days, keeping its time of day.
export function shiftWorkingDays(date: Date, columns: number) {
  return columnDay(date, columns, true);
}

export function nextWorkingDay(date: Date) {
  return shiftWorkingDays(date, 0);
}

export function previousWorkingDay(date: Date) {
  return isWeekendDay(date) ? shiftWorkingDays(date, -1) : date;
}

// The columns a span of days covers as `from` and exclusive `to`. A span
// that lies entirely on hidden days is empty (`to <= from`).
export function daySpanColumns(
  start: Date,
  end: Date,
  rangeStart: Date,
  hideWeekends = false,
) {
  const from = dayColumn(start, rangeStart, hideWeekends);
  const last = dayColumn(end, rangeStart, hideWeekends);
  return {
    from,
    to: hideWeekends && isWeekendDay(end) ? last : last + 1,
  };
}

// The working days a span runs for, at least one: where a resize stops.
export function spanLength(start: Date, end: Date, hideWeekends: boolean) {
  if (!hideWeekends) return differenceInCalendarDays(end, start);
  const first = nextWorkingDay(start);
  const last = previousWorkingDay(end);
  return Math.max(dayColumn(last, first, true), 0);
}

// How many calendar days the start and the end of a span move when each is
// moved by whole columns. Ends on hidden days move from the working day they
// are drawn on, so a Monday-to-Friday bar moved three columns stays
// Monday-to-Friday long.
export function columnShifts(
  start: Date,
  end: Date,
  startColumns: number,
  endColumns: number,
  hideWeekends: boolean,
) {
  if (!hideWeekends) return { startDays: startColumns, endDays: endColumns };
  const first = nextWorkingDay(start);
  const lastDrawn = previousWorkingDay(end);
  const weekendOnly = differenceInCalendarDays(lastDrawn, first) < 0;
  const last = weekendOnly ? first : lastDrawn;
  // A span on weekend days alone is drawn on `first`, not on its hidden end,
  // so once its start moves its end has to land on that column too, or the
  // bar would jump instead of growing.
  const movesEnd = endColumns !== 0 || (weekendOnly && startColumns !== 0);
  return {
    startDays: startColumns
      ? differenceInCalendarDays(shiftWorkingDays(first, startColumns), start)
      : 0,
    endDays: movesEnd
      ? differenceInCalendarDays(shiftWorkingDays(last, endColumns), end)
      : 0,
  };
}
