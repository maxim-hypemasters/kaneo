import { HTTPException } from "hono/http-exception";
import { ApiError } from "../errors/api-error";
import type { TimeOffStatus } from "./time-off-kinds";

// Shared by the id lookup and the controllers: a request the viewer may not
// see reads exactly like an unknown id.
export const TIME_OFF_NOT_FOUND = "Time off request not found";

export function timeOffNotFound() {
  return new HTTPException(404, { message: TIME_OFF_NOT_FOUND });
}

export function holidayCalendarRequestNotFound() {
  return new HTTPException(404, {
    message: "Holiday calendar request not found",
  });
}

export function memberNotFound() {
  return new HTTPException(404, { message: "Member not found" });
}

export function missingTimeOffPermission(action: "create" | "approve") {
  return new ApiError(403, {
    message: "Insufficient permissions",
    code: "MISSING_PERMISSION",
    missingPermissions: [`time_off:${action}`],
  });
}

export function timeOffStatusError(status: TimeOffStatus) {
  return new ApiError(409, {
    code: "TIME_OFF_STATUS",
    message: `This request was already ${status}`,
  });
}

export function timeOffChangedError() {
  return new ApiError(409, {
    code: "TIME_OFF_CHANGED",
    message: "This request changed; review it again",
  });
}

export function timeOffOverlapError() {
  return new ApiError(409, {
    code: "TIME_OFF_OVERLAP",
    message: "Overlaps another request for these days",
  });
}

export function timeOffStartedError() {
  return new ApiError(409, {
    code: "TIME_OFF_STARTED",
    message: "Ask an approver to cancel time off that has started",
  });
}

// Never echoes the codes back: the caller already has them.
export function unknownHolidayCalendar() {
  return new ApiError(400, {
    code: "TIME_OFF_HOLIDAY_CALENDAR_UNKNOWN",
    message: "Unknown holiday country or region",
  });
}
