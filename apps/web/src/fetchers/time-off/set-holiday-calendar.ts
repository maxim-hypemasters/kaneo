import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export type SetHolidayCalendarInput = {
  // Omit for your own calendar.
  userId?: string;
  country: string;
  // Null for the whole country.
  region?: string | null;
};

export async function setHolidayCalendar(
  workspaceId: string,
  { userId, country, region }: SetHolidayCalendarInput,
  lang?: string,
) {
  const response = await client["time-off"].workspace[":workspaceId"][
    "holiday-calendar"
  ].$put({
    param: { workspaceId },
    query: lang ? { lang } : {},
    json: { ...(userId ? { userId } : {}), country, region: region ?? null },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
