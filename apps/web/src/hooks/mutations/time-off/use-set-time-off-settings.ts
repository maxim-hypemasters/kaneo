import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setTimeOffSettings } from "@/fetchers/time-off/set-time-off-settings";
import type { TimeOffSettingsInput } from "@/fetchers/time-off/types";
import { timeOffKey } from "@/hooks/queries/time-off/time-off-keys";

// Members' holiday cards show the deadline too, so all of time off refetches.
export function useSetTimeOffSettings(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: TimeOffSettingsInput) =>
      setTimeOffSettings(workspaceId, settings),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: timeOffKey(workspaceId) }),
  });
}
