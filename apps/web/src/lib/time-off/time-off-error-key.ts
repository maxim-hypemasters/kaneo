import { HttpError } from "@/lib/http-error";

const ERROR_KEYS = {
  TIME_OFF_OVERLAP: "team:timeOff.errors.overlap",
  TIME_OFF_STATUS: "team:timeOff.errors.status",
  TIME_OFF_CHANGED: "team:timeOff.errors.changed",
  TIME_OFF_STARTED: "team:timeOff.errors.started",
  TIME_OFF_RANGE: "team:timeOff.errors.range",
  TIME_OFF_NO_WEEKDAYS: "team:timeOff.errors.noWeekdays",
  TIME_OFF_HOLIDAY_CALENDAR_UNKNOWN:
    "team:timeOff.errors.holidayCalendarUnknown",
} as const;

export type TimeOffErrorCode = keyof typeof ERROR_KEYS;
export type TimeOffErrorKey = (typeof ERROR_KEYS)[TimeOffErrorCode];

export function timeOffErrorCode(error: unknown): TimeOffErrorCode | null {
  if (!(error instanceof HttpError) || !error.code) return null;
  return error.code in ERROR_KEYS ? (error.code as TimeOffErrorCode) : null;
}

// The friendly message for a time-off API error code, or null for any other
// error, which keeps the server's own message.
export function timeOffErrorKey(error: unknown): TimeOffErrorKey | null {
  const code = timeOffErrorCode(error);
  return code ? ERROR_KEYS[code] : null;
}
