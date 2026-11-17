import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setDefaultTimeOffAllowance } from "@/fetchers/time-off/set-default-time-off-allowance";
import type { TimeOffType } from "@/fetchers/time-off/types";
import { timeOffKey } from "@/hooks/queries/time-off/time-off-keys";

export function useSetDefaultTimeOffAllowance(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, days }: { type: TimeOffType; days: number }) =>
      setDefaultTimeOffAllowance(workspaceId, type, days),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: timeOffKey(workspaceId) }),
  });
}
