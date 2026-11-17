import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// Records No calendar: the member enters public holidays as requests again.
// Omit userId for your own calendar. `lang` is the names' language in the
// result.
export async function clearHolidayCalendar(
  workspaceId: string,
  userId?: string,
  lang?: string,
) {
  const response = await client["time-off"].workspace[":workspaceId"][
    "holiday-calendar"
  ].$delete({
    param: { workspaceId },
    query: { ...(userId ? { userId } : {}), ...(lang ? { lang } : {}) },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
