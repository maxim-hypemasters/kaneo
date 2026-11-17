import { useMutation, useQueryClient } from "@tanstack/react-query";
import { approveHolidayCalendarRequest } from "@/fetchers/time-off/approve-holiday-calendar-request";
import { declineHolidayCalendarRequest } from "@/fetchers/time-off/decline-holiday-calendar-request";
import { timeOffKey } from "@/hooks/queries/time-off/time-off-keys";

export type HolidayCalendarDecision = "approve" | "decline";

type DecideInput = {
  id: string;
  // The version the approver reviewed.
  version: number;
  decision: HolidayCalendarDecision;
};

// A newer change by the member returns 409 TIME_OFF_CHANGED and the refetch
// shows it.
export function useDecideHolidayCalendarRequest(
  workspaceId: string,
  lang?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, decision }: DecideInput) =>
      decision === "approve"
        ? approveHolidayCalendarRequest(workspaceId, id, version, lang)
        : declineHolidayCalendarRequest(workspaceId, id, version, lang),
    onSuccess: (_result, { decision }) => {
      // An approved calendar changes the member's blocked days in planning.
      if (decision === "approve")
        void queryClient.invalidateQueries({ queryKey: ["project-schedule"] });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: timeOffKey(workspaceId) }),
  });
}
