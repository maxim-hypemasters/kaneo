import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// Withdraws a pending calendar change; the calendar stays as it is. A request
// no longer pending returns 409 TIME_OFF_STATUS.
export async function cancelHolidayCalendarRequest(
  workspaceId: string,
  requestId: string,
) {
  const response = await client["time-off"].workspace[":workspaceId"][
    "holiday-calendar-requests"
  ][":requestId"].cancel.$post({ param: { workspaceId, requestId } });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
