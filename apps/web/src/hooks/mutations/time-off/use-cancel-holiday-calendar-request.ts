import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cancelHolidayCalendarRequest } from "@/fetchers/time-off/cancel-holiday-calendar-request";
import { timeOffKey } from "@/hooks/queries/time-off/time-off-keys";

// Withdraws a pending calendar change. Nothing in planning changes.
export function useCancelHolidayCalendarRequest(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) =>
      cancelHolidayCalendarRequest(workspaceId, requestId),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: timeOffKey(workspaceId) }),
  });
}
