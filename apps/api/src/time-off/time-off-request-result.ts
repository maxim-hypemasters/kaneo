import db from "../database";
import { NO_HOLIDAYS } from "./count-workdays";
import type { DayRange } from "./day-range";
import { readHolidayDays } from "./holidays/read-holiday-days";
import { type TimeOffRow, presentRequest } from "./present-time-off";
import { rangeYears } from "./range-years";
import { readTimeOffBalances } from "./read-balances";
import type { TimeOffViewer } from "./viewer";

// A mutation's response: the request as the viewer sees it now, and the
// requester's balances for every year the old and new ranges touch. Each
// balance carries every type, so an edit that changes the type needs nothing
// extra.
export async function timeOffRequestResult(
  viewer: TimeOffViewer,
  row: TimeOffRow,
  previous: DayRange = row,
) {
  const years = rangeYears(previous, row);
  const holidays = await readHolidayDays(
    db,
    viewer.workspaceId,
    [row.userId],
    years,
  );
  return {
    workspaceId: viewer.workspaceId,
    request: presentRequest(
      row,
      viewer,
      holidays.get(row.userId) ?? NO_HOLIDAYS,
    ),
    balances: await readTimeOffBalances(
      db,
      viewer.workspaceId,
      [row.userId],
      years,
      holidays,
    ),
  };
}
