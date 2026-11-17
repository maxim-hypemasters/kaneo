import { useMutation, useQueryClient } from "@tanstack/react-query";
import { approveTimeOffRequest } from "@/fetchers/time-off/approve-time-off-request";
import { timeOffKey } from "@/hooks/queries/time-off/time-off-keys";

// Sends the version the approver reviewed; a newer edit returns 409
// TIME_OFF_CHANGED and the refetch shows it.
export function useApproveTimeOffRequest(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      approveTimeOffRequest(id, version),
    onSuccess: () =>
      // Approved time off blocks days in planning.
      queryClient.invalidateQueries({ queryKey: ["project-schedule"] }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: timeOffKey(workspaceId) }),
  });
}
