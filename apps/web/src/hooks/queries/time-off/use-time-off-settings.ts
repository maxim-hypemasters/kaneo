import { useQuery } from "@tanstack/react-query";
import { getTimeOffSettings } from "@/fetchers/time-off/get-time-off-settings";
import { timeOffSettingsKey } from "./time-off-keys";

// The workspace's time off settings. Needs time_off:approve; pass enabled
// only for approvers.
export function useTimeOffSettings(
  workspaceId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: timeOffSettingsKey(workspaceId),
    queryFn: () => getTimeOffSettings(workspaceId),
    enabled: Boolean(workspaceId) && enabled,
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
