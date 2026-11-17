import { and, asc, eq } from "drizzle-orm";
import db from "../../../database";
import {
  timeOffHolidayCalendarRequestTable as requests,
  timeOffHolidayCalendarTable as calendars,
} from "../../../database/schema";
import { heldByCurrentMember } from "../../access";
import { assertTimeOffApprover, type TimeOffViewer } from "../../viewer";
import { holidayCalendarCode } from "../holiday-calendar-code";
import { presentHolidayCalendar } from "../present-holiday-calendar";
import { presentHolidayCalendarRequest } from "./present-holiday-calendar-request";

// Pending calendar requests of current members, oldest first, each with the
// calendar it would replace. Approvers only.
export async function listHolidayCalendarRequests(
  viewer: TimeOffViewer,
  lang?: string,
) {
  assertTimeOffApprover(viewer);
  const rows = await db
    .select({
      request: requests,
      country: calendars.country,
      region: calendars.region,
    })
    .from(requests)
    .leftJoin(
      calendars,
      and(
        eq(calendars.workspaceId, requests.workspaceId),
        eq(calendars.userId, requests.userId),
      ),
    )
    .where(
      and(
        eq(requests.workspaceId, viewer.workspaceId),
        eq(requests.status, "pending"),
        heldByCurrentMember(requests, db),
      ),
    )
    .orderBy(asc(requests.createdAt), asc(requests.id));
  return {
    workspaceId: viewer.workspaceId,
    requests: rows.map(({ request, country, region }) => ({
      ...presentHolidayCalendarRequest(request, lang),
      currentCalendar: presentHolidayCalendar(
        holidayCalendarCode({ country, region }),
        lang,
      ),
    })),
  };
}
