import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@/components/project/error-message";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { HolidayCalendarRequest } from "@/fetchers/time-off/types";
import { useCancelHolidayCalendarRequest } from "@/hooks/mutations/time-off/use-cancel-holiday-calendar-request";
import { timeOffErrorCode } from "@/lib/time-off/time-off-error-key";
import { toast } from "@/lib/toast";
import { useHolidayCalendarLabel } from "./use-holiday-calendar-label";

type HolidayCalendarPendingProps = {
  workspaceId: string;
  request: HolidayCalendarRequest;
  // Withdrawing your own change needs time_off:create.
  canWithdraw: boolean;
  // The change was withdrawn, or was already decided, and its button is
  // about to leave.
  onWithdrawn?: () => void;
};

// Your calendar change waiting for approval. The current calendar applies
// until an approver decides.
export function HolidayCalendarPending({
  workspaceId,
  request,
  canWithdraw,
  onWithdrawn,
}: HolidayCalendarPendingProps) {
  const { t } = useTranslation();
  const calendarLabel = useHolidayCalendarLabel();
  const cancel = useCancelHolidayCalendarRequest(workspaceId);

  // The mutation refetches time off when it settles, so after a 409 the card
  // already shows the decision.
  const withdraw = async () => {
    if (cancel.isPending) return;
    try {
      await cancel.mutateAsync(request.id);
      toast.success(t("team:timeOff.holidays.withdrawn"));
      onWithdrawn?.();
    } catch (error) {
      if (timeOffErrorCode(error) === "TIME_OFF_STATUS") {
        toast.error(t("team:timeOff.holidays.withdrawDecided"));
        onWithdrawn?.();
        return;
      }
      toast.error(
        errorMessage(error, t("team:timeOff.holidays.withdrawError")),
      );
    }
  };

  return (
    <Alert variant="warning" role="status">
      <Clock aria-hidden="true" />
      <AlertTitle>
        {t("team:timeOff.holidays.pending", {
          calendar: calendarLabel(request.calendar),
        })}
      </AlertTitle>
      <AlertDescription className="text-xs">
        <p>{t("team:timeOff.holidays.pendingHint")}</p>
        {canWithdraw ? (
          <Button
            variant="outline"
            size="xs"
            className="self-start"
            loading={cancel.isPending}
            aria-label={t("team:timeOff.holidays.withdrawLabel")}
            onClick={() => void withdraw()}
          >
            {t("team:timeOff.holidays.withdraw")}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
