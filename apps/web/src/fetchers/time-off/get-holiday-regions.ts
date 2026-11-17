import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// A country's regions with their own holidays; empty when it has none.
export async function getHolidayRegions(
  workspaceId: string,
  country: string,
  lang?: string,
) {
  const response = await client["time-off"].workspace[":workspaceId"][
    "holiday-countries"
  ][":country"].regions.$get({
    param: { workspaceId, country },
    query: lang ? { lang } : {},
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
