import db from "../../database";
import { assertTimeOffApprover, type TimeOffViewer } from "../viewer";
import { readHolidayCalendarDeadline } from "./read-holiday-calendar-deadline";

// The workspace's time off settings. Members read the deadline that applies
// to them from their holidays instead.
export async function getTimeOffSettings(viewer: TimeOffViewer) {
  assertTimeOffApprover(viewer);
  return {
    workspaceId: viewer.workspaceId,
    holidayCalendarDeadline: await readHolidayCalendarDeadline(
      db,
      viewer.workspaceId,
    ),
  };
}
