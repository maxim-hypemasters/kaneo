import { Link } from "@tanstack/react-router";
import { ArrowUpRight, TreePalm } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getEventDataRecord } from "@/components/notification/notification-text";
import { Button } from "@/components/ui/button";
import { formatReleaseRange } from "@/lib/releases/release-date";
import { timeOffNotificationSearch } from "./time-off-notification-search";
import type { TimeOffNotificationType } from "./time-off-notification-type";

type InboxTimeOffProps = {
  type: TimeOffNotificationType;
  eventData: unknown;
  workspaceId: string;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const PERSON = {
  time_off_requested: {
    labelKey: "notifications:inbox.timeOff.requestedBy",
    field: "requesterName",
  },
  time_off_approved: {
    labelKey: "notifications:inbox.timeOff.approvedBy",
    field: "deciderName",
  },
  time_off_declined: {
    labelKey: "notifications:inbox.timeOff.declinedBy",
    field: "deciderName",
  },
  time_off_member_away: {
    labelKey: "notifications:inbox.timeOff.member",
    field: "userName",
  },
  time_off_holiday_calendar_requested: {
    labelKey: "notifications:inbox.timeOff.requestedBy",
    field: "requesterName",
  },
  time_off_holiday_calendar_approved: {
    labelKey: "notifications:inbox.timeOff.approvedBy",
    field: "deciderName",
  },
  time_off_holiday_calendar_declined: {
    labelKey: "notifications:inbox.timeOff.declinedBy",
    field: "deciderName",
  },
} as const satisfies Record<
  TimeOffNotificationType,
  { labelKey: string; field: string }
>;

const HINT_KEYS = {
  time_off_requested: "notifications:inbox.timeOff.hintRequested",
  time_off_approved: "notifications:inbox.timeOff.hintDecided",
  time_off_declined: "notifications:inbox.timeOff.hintDecided",
  time_off_member_away: "notifications:inbox.timeOff.hintMemberAway",
  time_off_holiday_calendar_requested:
    "notifications:inbox.timeOff.hintRequested",
  time_off_holiday_calendar_approved:
    "notifications:inbox.timeOff.hintHolidayCalendarDecided",
  time_off_holiday_calendar_declined:
    "notifications:inbox.timeOff.hintHolidayCalendarDecided",
} as const satisfies Record<TimeOffNotificationType, string>;

// The time off a notification is about: who and when, and a link to the
// Time off page. Notifications never carry the type or note, and holiday
// calendar requests never the country or region, so none of them shows here.
export function InboxTimeOff({
  type,
  eventData,
  workspaceId,
}: InboxTimeOffProps) {
  const { t } = useTranslation();
  const data = getEventDataRecord(eventData) ?? {};
  const startDate = typeof data.startDate === "string" ? data.startDate : "";
  const endDate = typeof data.endDate === "string" ? data.endDate : "";
  const range =
    ISO_DAY.test(startDate) && ISO_DAY.test(endDate)
      ? formatReleaseRange(startDate, endDate)
      : null;
  const person = PERSON[type];
  const name = data[person.field];
  const days = typeof data.days === "number" ? data.days : null;
  // Calendar requests carry no dates, so they head with Public holidays.
  const fallbackTitleKey = type.startsWith("time_off_holiday_calendar_")
    ? "team:timeOff.holidays.title"
    : "team:timeOff.pageTitle";
  const openWorkspaceId =
    typeof data.workspaceId === "string" && data.workspaceId
      ? data.workspaceId
      : workspaceId;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-2xl text-foreground tracking-tight">
          <TreePalm
            aria-hidden="true"
            className="size-5 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0">{range ?? t(fallbackTitleKey)}</span>
        </h2>
        <Button
          variant="outline"
          size="xs"
          render={
            <Link
              to="/dashboard/workspace/$workspaceId/time-off"
              params={{ workspaceId: openWorkspaceId }}
              search={timeOffNotificationSearch(type, startDate)}
            />
          }
        >
          {t("notifications:inbox.openTimeOff")}
          <ArrowUpRight />
        </Button>
      </div>
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-foreground/85">
        <div className="flex items-center gap-1.5">
          <dt className="text-muted-foreground">{t(person.labelKey)}</dt>
          <dd>
            {typeof name === "string" && name
              ? name
              : t("common:people.someone")}
          </dd>
        </div>
        {days !== null && (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">{t("team:timeOff.details.days")}</dt>
            <dd>{t("team:timeOff.weekdays", { count: days })}</dd>
          </div>
        )}
      </dl>
      <p className="text-muted-foreground text-xs">{t(HINT_KEYS[type])}</p>
    </div>
  );
}
