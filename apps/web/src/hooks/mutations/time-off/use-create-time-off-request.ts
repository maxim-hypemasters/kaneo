import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTimeOffRequest } from "@/fetchers/time-off/create-time-off-request";
import type { CreateTimeOffInput } from "@/fetchers/time-off/types";
import { timeOffKey } from "@/hooks/queries/time-off/time-off-keys";

// Every request starts pending, so planning is unaffected until approval.
export function useCreateTimeOffRequest(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTimeOffInput) =>
      createTimeOffRequest(workspaceId, data),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: timeOffKey(workspaceId) }),
  });
}
