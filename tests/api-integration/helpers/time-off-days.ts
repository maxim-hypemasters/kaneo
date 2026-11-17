import { addDays } from "./time-off";

// Day arithmetic written independently of the API's helpers, so tests check
// its counts instead of repeating them. All days are UTC YYYY-MM-DD strings.

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function currentYear() {
  return Number(todayUtc().slice(0, 4));
}

export function isWeekday(day: string) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

// Weekdays from start to end, both included, by walking every day.
export function weekdaysBetween(startDate: string, endDate: string) {
  let count = 0;
  for (let day = startDate; day <= endDate; day = addDays(day, 1)) {
    if (isWeekday(day)) count += 1;
  }
  return count;
}

// The shortest range starting on the first weekday on or after `from` that
// holds exactly `weekdays` weekdays.
export function weekdaySpan(from: string, weekdays: number) {
  let startDate = from;
  while (!isWeekday(startDate)) startDate = addDays(startDate, 1);
  let endDate = startDate;
  let count = 1;
  while (count < weekdays) {
    endDate = addDays(endDate, 1);
    if (isWeekday(endDate)) count += 1;
  }
  return { startDate, endDate };
}

// The latest range ending on Dec 31 of `year` that holds exactly `weekdays`
// weekdays in that year.
export function weekdaysBeforeYearEnd(year: number, weekdays: number) {
  let startDate = `${year}-12-31`;
  let count = isWeekday(startDate) ? 1 : 0;
  while (count < weekdays) {
    startDate = addDays(startDate, -1);
    if (isWeekday(startDate)) count += 1;
  }
  return startDate;
}

// The first Saturday on or after `from`.
export function saturdayFrom(from: string) {
  let day = from;
  while (new Date(`${day}T00:00:00Z`).getUTCDay() !== 6) day = addDays(day, 1);
  return day;
}
