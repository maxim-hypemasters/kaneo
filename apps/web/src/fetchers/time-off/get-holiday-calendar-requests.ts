import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// Current members' calendar changes waiting for approval, oldest first, with
// names in `lang`. Needs time_off:approve.
export async function getHolidayCalendarRequests(
  workspaceId: string,
  lang?: string,
) {
  const response = await client["time-off"].workspace[":workspaceId"][
    "holiday-calendar-requests"
  ].$get({ param: { workspaceId }, query: lang ? { lang } : {} });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
