import { useQuery } from "@tanstack/react-query";
import { getHolidayCountries } from "@/fetchers/time-off/get-holiday-countries";
import { timeOffHolidayCountriesKey } from "./time-off-keys";

// The data ships with the API and only changes on an upgrade.
const CATALOG_STALE_MS = 60 * 60_000;

// Countries a member can pick as their holiday calendar.
export function useHolidayCountries(
  workspaceId: string,
  { lang, enabled = true }: { lang?: string; enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: timeOffHolidayCountriesKey(workspaceId, lang),
    queryFn: () => getHolidayCountries(workspaceId, lang),
    enabled: Boolean(workspaceId) && enabled,
    staleTime: CATALOG_STALE_MS,
    select: (data) => data.countries,
  });
}
