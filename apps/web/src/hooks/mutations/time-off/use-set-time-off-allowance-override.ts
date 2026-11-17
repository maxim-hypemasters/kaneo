import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setTimeOffAllowanceOverride } from "@/fetchers/time-off/set-time-off-allowance-override";
import type { TimeOffType } from "@/fetchers/time-off/types";
import { timeOffKey } from "@/hooks/queries/time-off/time-off-keys";

export function useSetTimeOffAllowanceOverride(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      type,
      days,
    }: {
      userId: string;
      type: TimeOffType;
      days: number;
    }) => setTimeOffAllowanceOverride(workspaceId, userId, type, days),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: timeOffKey(workspaceId) }),
  });
}
