import { assertCanActFor, type TimeOffViewer } from "../viewer";
import { chooseHolidayCalendar } from "./choose-holiday-calendar";

// Sets a member to "No calendar", so their public holidays are entered as
// requests again, or asks for it when the change needs approval. The row
// stays, so the member's free first choice stays used.
export async function clearHolidayCalendar(
  viewer: TimeOffViewer,
  query: { userId?: string; lang?: string },
) {
  const userId = query.userId ?? viewer.userId;
  assertCanActFor(viewer, userId);
  return chooseHolidayCalendar(viewer, userId, null, query.lang);
}
