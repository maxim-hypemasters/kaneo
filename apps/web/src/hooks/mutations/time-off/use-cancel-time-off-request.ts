import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cancelTimeOffRequest } from "@/fetchers/time-off/cancel-time-off-request";
import { timeOffKey } from "@/hooks/queries/time-off/time-off-keys";

export function useCancelTimeOffRequest(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelTimeOffRequest(id),
    onSuccess: () =>
      // Cancelled approved time off gives the days back to planning.
      queryClient.invalidateQueries({ queryKey: ["project-schedule"] }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: timeOffKey(workspaceId) }),
  });
}
