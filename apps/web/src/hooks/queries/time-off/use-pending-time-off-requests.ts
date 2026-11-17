import { useQuery } from "@tanstack/react-query";
import { getPendingTimeOffRequests } from "@/fetchers/time-off/get-pending-time-off-requests";
import { pendingTimeOffKey } from "./time-off-keys";

// Needs time_off:approve; pass enabled only for approvers.
export function usePendingTimeOffRequests(
  workspaceId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: pendingTimeOffKey(workspaceId),
    queryFn: () => getPendingTimeOffRequests(workspaceId),
    enabled: Boolean(workspaceId) && enabled,
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
