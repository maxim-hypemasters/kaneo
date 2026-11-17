import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearHolidayCalendar } from "@/fetchers/time-off/clear-holiday-calendar";
import { setHolidayCalendar } from "@/fetchers/time-off/set-holiday-calendar";
import { timeOffKey } from "@/hooks/queries/time-off/time-off-keys";

export type HolidayCalendarChoice = {
  // Omit for your own calendar.
  userId?: string;
  // Null picks No calendar.
  country: string | null;
  region?: string | null;
};

// Sets a member's public holiday calendar, or No calendar. A change that
// needs approval comes back pending and changes nothing yet; one that
// applies makes plans that include the member go out of date, so schedules
// refetch too.
export function useSetHolidayCalendar(workspaceId: string, lang?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, country, region }: HolidayCalendarChoice) =>
      country === null
        ? clearHolidayCalendar(workspaceId, userId, lang)
        : setHolidayCalendar(workspaceId, { userId, country, region }, lang),
    onSuccess: (result) => {
      if (result.status === "applied")
        void queryClient.invalidateQueries({ queryKey: ["project-schedule"] });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: timeOffKey(workspaceId) }),
  });
}
