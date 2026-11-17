import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@/components/project/error-message";
import { AssigneeAvatar } from "@/components/task/properties/assignee-avatar";
import { Button } from "@/components/ui/button";
import type { PendingHolidayCalendarRequest } from "@/fetchers/time-off/types";
import {
  type HolidayCalendarDecision,
  useDecideHolidayCalendarRequest,
} from "@/hooks/mutations/time-off/use-decide-holiday-calendar-request";
import { formatReleaseDate, toReleaseDate } from "@/lib/releases/release-date";
import { timeOffErrorCode } from "@/lib/time-off/time-off-error-key";
import { toast } from "@/lib/toast";
import { useHolidayCalendarLabel } from "../holidays/use-holiday-calendar-label";
import type { TimelineMember } from "../timeline/timeline-members";

type HolidayCalendarRequestRowProps = {
  workspaceId: string;
  request: PendingHolidayCalendarRequest;
  // Missing while the member list doesn't include the requester.
  member?: TimelineMember;
  isViewer: boolean;
  today: string;
  // The calendar names' language, as in the list.
  lang?: string;
  // The request was decided, by this approver or someone else, and leaves the
  // list.
  onDecided?: () => void;
};

const SUCCESS_KEYS = {
  approve: "team:timeOff.approvals.calendarApproved",
  decline: "team:timeOff.approvals.calendarDeclined",
} as const satisfies Record<HolidayCalendarDecision, string>;

// A member's public holiday calendar change: from the calendar in effect to
// the one asked for.
export function HolidayCalendarRequestRow({
  workspaceId,
  request,
  member,
  isViewer,
  today,
  lang,
  onDecided,
}: HolidayCalendarRequestRowProps) {
  const { t } = useTranslation();
  const calendarLabel = useHolidayCalendarLabel();
  const decideRequest = useDecideHolidayCalendarRequest(workspaceId, lang);
  const name = member?.name || t("common:people.unknown");
  const from = calendarLabel(request.currentCalendar);
  const to = calendarLabel(request.calendar);
  // A resubmission updates the request in place, so this is when the member
  // last changed it.
  const requested = formatReleaseDate(
    toReleaseDate(new Date(request.updatedAt)),
    { today },
  );
  const busy = decideRequest.isPending;
  const deciding = (decision: HolidayCalendarDecision) =>
    busy && decideRequest.variables?.decision === decision;

  // The mutation refetches every time-off query when it settles, so after a
  // 409 the list already shows the request as it is now.
  const decide = async (decision: HolidayCalendarDecision) => {
    try {
      // The version the approver is looking at: a change since then is
      // rejected instead of deciding a calendar they haven't seen.
      await decideRequest.mutateAsync({
        id: request.id,
        version: request.version,
        decision,
      });
      toast.success(t(SUCCESS_KEYS[decision], { name }));
      onDecided?.();
    } catch (error) {
      const code = timeOffErrorCode(error);
      if (code === "TIME_OFF_CHANGED") {
        toast.error(t("team:timeOff.approvals.changed"));
      } else if (code === "TIME_OFF_STATUS") {
        toast.error(t("team:timeOff.approvals.alreadyDecided"));
        onDecided?.();
      } else if (code === "TIME_OFF_HOLIDAY_CALENDAR_UNKNOWN") {
        toast.error(t("team:timeOff.approvals.calendarUnknown"));
      } else {
        toast.error(errorMessage(error, t("team:timeOff.approvals.error")));
      }
    }
  };

  return (
    <li className="flex flex-col gap-3 border-b px-3 py-3 last:border-b-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <AssigneeAvatar
          assigned
          name={member?.name}
          image={member?.image}
          className="mt-0.5 size-7"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="truncate font-medium" title={name}>
              {name}
            </span>
            {isViewer ? (
              <span className="shrink-0 text-muted-foreground text-xs">
                {t("team:timeOff.you")}
              </span>
            ) : null}
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground text-xs">
            <span
              aria-hidden="true"
              className="flex min-w-0 flex-wrap items-center gap-1"
            >
              <span>{from}</span>
              <ArrowRight className="size-3.5 rtl:rotate-180" />
              <span className="font-medium text-foreground">{to}</span>
            </span>
            <span className="sr-only">
              {t("team:timeOff.approvals.calendarChange", { from, to })}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {t("team:timeOff.approvals.requestedOn", { date: requested })}
            </span>
          </p>
        </div>
      </div>
      <div className="flex shrink-0 justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          loading={deciding("decline")}
          disabled={busy}
          aria-label={t("team:timeOff.approvals.declineCalendarFor", { name })}
          onClick={() => void decide("decline")}
        >
          {t("team:timeOff.approvals.decline")}
        </Button>
        <Button
          size="sm"
          loading={deciding("approve")}
          disabled={busy}
          aria-label={t("team:timeOff.approvals.approveCalendarFor", { name })}
          onClick={() => void decide("approve")}
        >
          {t("team:timeOff.approvals.approve")}
        </Button>
      </div>
    </li>
  );
}
