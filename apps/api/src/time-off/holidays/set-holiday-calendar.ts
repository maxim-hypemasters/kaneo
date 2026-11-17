import { unknownHolidayCalendar } from "../time-off-errors";
import { assertCanActFor, type TimeOffViewer } from "../viewer";
import { isValidHolidayCalendar } from "./catalog";
import { chooseHolidayCalendar } from "./choose-holiday-calendar";
import type { SetHolidayCalendarInput } from "./schema";

// Sets a member's public holiday calendar, or asks for it when the change
// needs approval.
export async function setHolidayCalendar(
  viewer: TimeOffViewer,
  body: SetHolidayCalendarInput,
  lang?: string,
) {
  const userId = body.userId ?? viewer.userId;
  assertCanActFor(viewer, userId);
  const calendar = { country: body.country, region: body.region ?? null };
  if (!isValidHolidayCalendar(calendar)) throw unknownHolidayCalendar();
  return chooseHolidayCalendar(viewer, userId, calendar, lang);
}
