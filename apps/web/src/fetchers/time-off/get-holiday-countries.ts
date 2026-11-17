import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// Countries with holiday data, with names in `lang`.
export async function getHolidayCountries(workspaceId: string, lang?: string) {
  const response = await client["time-off"].workspace[":workspaceId"][
    "holiday-countries"
  ].$get({ param: { workspaceId }, query: lang ? { lang } : {} });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
