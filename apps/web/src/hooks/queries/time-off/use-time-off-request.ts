import { useQuery } from "@tanstack/react-query";
import { getTimeOffRequest } from "@/fetchers/time-off/get-time-off-request";
import { timeOffRequestKey } from "./time-off-keys";

export function useTimeOffRequest(
  workspaceId: string,
  id: string | null,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: timeOffRequestKey(workspaceId, id ?? ""),
    queryFn: () => getTimeOffRequest(id ?? ""),
    enabled: Boolean(workspaceId && id) && enabled,
    staleTime: 30_000,
    refetchOnMount: true,
  });
}
