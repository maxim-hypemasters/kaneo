import { expect, it } from "vite-plus/test";
import { HttpError } from "@/lib/http-error";
import { timeOffErrorKey } from "./time-off-error-key";

it("maps time-off error codes to friendly messages", () => {
  expect(
    timeOffErrorKey(
      new HttpError(409, "Overlaps", { code: "TIME_OFF_OVERLAP" }),
    ),
  ).toBe("team:timeOff.errors.overlap");
  expect(
    timeOffErrorKey(
      new HttpError(400, "No weekdays", { code: "TIME_OFF_NO_WEEKDAYS" }),
    ),
  ).toBe("team:timeOff.errors.noWeekdays");
  expect(
    timeOffErrorKey(
      new HttpError(400, "Unknown calendar", {
        code: "TIME_OFF_HOLIDAY_CALENDAR_UNKNOWN",
      }),
    ),
  ).toBe("team:timeOff.errors.holidayCalendarUnknown");
});

it("keeps other errors for their own message", () => {
  expect(
    timeOffErrorKey(new HttpError(403, "Nope", { code: "MISSING_PERMISSION" })),
  ).toBeNull();
  expect(timeOffErrorKey(new HttpError(500, "Boom"))).toBeNull();
  expect(timeOffErrorKey(new Error("Offline"))).toBeNull();
});
