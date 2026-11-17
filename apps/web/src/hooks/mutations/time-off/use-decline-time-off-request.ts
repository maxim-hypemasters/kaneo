import { useMutation, useQueryClient } from "@tanstack/react-query";
import { declineTimeOffRequest } from "@/fetchers/time-off/decline-time-off-request";
import { timeOffKey } from "@/hooks/queries/time-off/time-off-keys";

// Sends the version the approver reviewed; a newer edit returns 409
// TIME_OFF_CHANGED and the refetch shows it.
export function useDeclineTimeOffRequest(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      declineTimeOffRequest(id, version),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: timeOffKey(workspaceId) }),
  });
}
