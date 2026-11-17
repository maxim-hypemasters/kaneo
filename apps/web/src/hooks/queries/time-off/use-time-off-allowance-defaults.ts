import { useQuery } from "@tanstack/react-query";
import { getTimeOffAllowanceDefaults } from "@/fetchers/time-off/get-time-off-allowance-defaults";
import { timeOffAllowanceDefaultsKey } from "./time-off-keys";

// The workspace default allowance of each type. Needs time_off:approve; pass
// enabled only for approvers.
export function useTimeOffAllowanceDefaults(
  workspaceId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: timeOffAllowanceDefaultsKey(workspaceId),
    queryFn: () => getTimeOffAllowanceDefaults(workspaceId),
    enabled: Boolean(workspaceId) && enabled,
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
