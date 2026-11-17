import { useQuery } from "@tanstack/react-query";
import { getHolidayRegions } from "@/fetchers/time-off/get-holiday-regions";
import { timeOffHolidayRegionsKey } from "./time-off-keys";

// The data ships with the API and only changes on an upgrade.
const CATALOG_STALE_MS = 60 * 60_000;

// A country's regions; disabled until a country is picked.
export function useHolidayRegions(
  workspaceId: string,
  country: string | null,
  { lang }: { lang?: string } = {},
) {
  return useQuery({
    queryKey: timeOffHolidayRegionsKey(workspaceId, country ?? "", lang),
    queryFn: () => getHolidayRegions(workspaceId, country ?? "", lang),
    enabled: Boolean(workspaceId && country),
    staleTime: CATALOG_STALE_MS,
    select: (data) => data.regions,
  });
}
