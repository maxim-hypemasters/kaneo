// The Team timeline shows one calendar month, kept in the URL as YYYY-MM.
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthParam(value: unknown): value is string {
  return typeof value === "string" && MONTH.test(value);
}

// The month a YYYY-MM-DD day falls in.
export function toMonthParam(day: string) {
  return day.slice(0, 7);
}

export function monthYear(month: string) {
  return Number(month.slice(0, 4));
}

function parts(month: string) {
  return { year: Number(month.slice(0, 4)), index: Number(month.slice(5, 7)) };
}

function format(year: number, index: number) {
  return `${String(year).padStart(4, "0")}-${String(index).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number) {
  const { year, index } = parts(month);
  const total = year * 12 + (index - 1) + delta;
  return format(Math.floor(total / 12), (total % 12) + 1);
}

export function daysInMonth(month: string) {
  const { year, index } = parts(month);
  return new Date(Date.UTC(year, index, 0)).getUTCDate();
}

// The first and last day of the month, for the calendar query.
export function monthRange(month: string) {
  return {
    from: `${month}-01`,
    to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}`,
  };
}

// Every day of the month as YYYY-MM-DD.
export function monthDays(month: string) {
  return Array.from(
    { length: daysInMonth(month) },
    (_, offset) => `${month}-${String(offset + 1).padStart(2, "0")}`,
  );
}
