import { calendarDayCount } from "@/lib/time-off/calendar-day-count";
import { countWorkdays, NO_HOLIDAYS } from "@/lib/time-off/count-workdays";
import type { TimeOffFormValues } from "./time-off-form-values";

const MAX_RANGE_DAYS = 366;

export type TimeOffFieldError = {
  key:
    | "team:timeOff.validation.dateRequired"
    | "team:timeOff.validation.endBeforeStart"
    | "team:timeOff.validation.tooLong"
    | "team:timeOff.validation.outOfRange"
    | "team:timeOff.validation.noWeekdays"
    | "team:timeOff.validation.memberRequired";
  // The allowed window (YYYY-MM-DD), for outOfRange.
  window?: TimeOffWindow;
};

export type TimeOffFormErrors = Partial<
  Record<"startDate" | "endDate" | "member", TimeOffFieldError>
>;

export type TimeOffWindow = { earliest: string; latest: string };

// The API accepts days from Jan 1 of last year to Dec 31 of next year.
export function timeOffWindow(today: string): TimeOffWindow {
  const year = Number(today.slice(0, 4));
  return { earliest: `${year - 1}-01-01`, latest: `${year + 1}-12-31` };
}

type Options = {
  // The viewer's day, YYYY-MM-DD.
  today: string;
  // The stored dates of a request being edited: unchanged dates skip the
  // length, window and working day checks, as the API does.
  original?: { startDate: string; endDate: string };
  // The member's calendar holidays, which are not working days.
  holidays?: ReadonlySet<string>;
};

// The API's rules, so most mistakes show before sending. Going over the
// allowance is never an error.
export function validateTimeOff(
  values: TimeOffFormValues,
  { today, original, holidays = NO_HOLIDAYS }: Options,
): TimeOffFormErrors {
  const errors: TimeOffFormErrors = {};
  const { startDate, endDate } = values;
  if (values.member === null) {
    errors.member = { key: "team:timeOff.validation.memberRequired" };
  }
  if (!startDate) {
    errors.startDate = { key: "team:timeOff.validation.dateRequired" };
  }
  if (!endDate) {
    errors.endDate = { key: "team:timeOff.validation.dateRequired" };
  }
  if (!startDate || !endDate) return errors;
  if (endDate < startDate) {
    errors.endDate = { key: "team:timeOff.validation.endBeforeStart" };
    return errors;
  }
  if (original?.startDate === startDate && original.endDate === endDate) {
    return errors;
  }
  if (calendarDayCount(startDate, endDate) > MAX_RANGE_DAYS) {
    errors.endDate = { key: "team:timeOff.validation.tooLong" };
    return errors;
  }
  const window = timeOffWindow(today);
  if (startDate < window.earliest) {
    errors.startDate = { key: "team:timeOff.validation.outOfRange", window };
  }
  if (endDate > window.latest) {
    errors.endDate = { key: "team:timeOff.validation.outOfRange", window };
  }
  if (errors.startDate || errors.endDate) return errors;
  if (countWorkdays(startDate, endDate, holidays) === 0) {
    errors.endDate = { key: "team:timeOff.validation.noWeekdays" };
  }
  return errors;
}
