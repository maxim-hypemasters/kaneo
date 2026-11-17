import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// `version` is the one the approver reviewed; a newer change by the member
// returns 409 TIME_OFF_CHANGED.
export async function approveHolidayCalendarRequest(
  workspaceId: string,
  requestId: string,
  version: number,
  lang?: string,
) {
  const response = await client["time-off"].workspace[":workspaceId"][
    "holiday-calendar-requests"
  ][":requestId"].approve.$post({
    param: { workspaceId, requestId },
    query: lang ? { lang } : {},
    json: { version },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
