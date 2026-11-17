import { useQuery } from "@tanstack/react-query";
import { getHolidayCalendarRequests } from "@/fetchers/time-off/get-holiday-calendar-requests";
import { holidayCalendarRequestsKey } from "./time-off-keys";

// Calendar changes waiting for approval. Needs time_off:approve; pass enabled
// only for approvers.
export function useHolidayCalendarRequests(
  workspaceId: string,
  lang?: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: holidayCalendarRequestsKey(workspaceId, lang),
    queryFn: () => getHolidayCalendarRequests(workspaceId, lang),
    enabled: Boolean(workspaceId) && enabled,
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
