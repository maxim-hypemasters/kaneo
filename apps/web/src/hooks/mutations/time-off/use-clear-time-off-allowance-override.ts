import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearTimeOffAllowanceOverride } from "@/fetchers/time-off/clear-time-off-allowance-override";
import type { TimeOffType } from "@/fetchers/time-off/types";
import { timeOffKey } from "@/hooks/queries/time-off/time-off-keys";

// Puts the member back on the workspace default for one type.
export function useClearTimeOffAllowanceOverride(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, type }: { userId: string; type: TimeOffType }) =>
      clearTimeOffAllowanceOverride(workspaceId, userId, type),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: timeOffKey(workspaceId) }),
  });
}
