import { HTTPException } from "hono/http-exception";
import { listHolidayRegions } from "./catalog";

// An unknown country is a missing resource, not a bad request.
export function holidayRegionList(
  workspaceId: string,
  country: string,
  lang?: string,
) {
  const regions = listHolidayRegions(country, lang);
  if (!regions) throw new HTTPException(404, { message: "Country not found" });
  return { workspaceId, country, regions: [...regions] };
}
