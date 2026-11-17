import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateTimeOffInput } from "@/fetchers/time-off/types";
import { updateTimeOffRequest } from "@/fetchers/time-off/update-time-off-request";
import { timeOffKey } from "@/hooks/queries/time-off/time-off-keys";

export function useUpdateTimeOffRequest(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTimeOffInput }) =>
      updateTimeOffRequest(id, data),
    onSuccess: (result) => {
      // An approver's edit of approved time off moves planned work.
      if (result.request.status === "approved") {
        void queryClient.invalidateQueries({ queryKey: ["project-schedule"] });
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: timeOffKey(workspaceId) }),
  });
}
