import db from "../database";
import { findTimeOff } from "./access";
import { assertTimeOffVisible } from "./assert-time-off-action";
import { NO_HOLIDAYS } from "./count-workdays";
import { readHolidayDays } from "./holidays/read-holiday-days";
import { presentRequest } from "./present-time-off";
import { rangeYears } from "./range-years";
import type { TimeOffViewer } from "./viewer";

export async function getTimeOffRequest(viewer: TimeOffViewer, id: string) {
  const row = await findTimeOff(db, viewer.workspaceId, id);
  assertTimeOffVisible(row, viewer);
  const holidays = await readHolidayDays(
    db,
    viewer.workspaceId,
    [row.userId],
    rangeYears(row),
  );
  return presentRequest(row, viewer, holidays.get(row.userId) ?? NO_HOLIDAYS);
}
