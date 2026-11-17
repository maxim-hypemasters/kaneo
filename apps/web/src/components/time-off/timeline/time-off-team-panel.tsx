import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TimeOffRequest } from "@/fetchers/time-off/types";
import { useTimeOffCalendar } from "@/hooks/queries/time-off/use-time-off-calendar";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { monthRange } from "@/lib/time-off/time-off-month";
import { TimeOffLoadError } from "../time-off-load-error";
import { TimeOffMonthNav } from "../time-off-month-nav";
import { useTimeOffFormatLocale } from "../use-time-off-format-locale";
import { entriesByUser } from "./entries-by-user";
import { holidaysByUser } from "./holidays-by-user";
import { TimeOffTimeline } from "./time-off-timeline";
import { TimeOffTimelineSkeleton } from "./time-off-timeline-skeleton";
import { timelineMembers } from "./timeline-members";

type TimeOffTeamPanelProps = {
  workspaceId: string;
  // YYYY-MM.
  month: string;
  today: string;
  viewerId?: string;
  onMonthChange: (month: string) => void;
  onEdit?: (request: TimeOffRequest) => void;
  onCancel?: (request: TimeOffRequest) => void;
};

export function TimeOffTeamPanel({
  workspaceId,
  month,
  today,
  viewerId,
  onMonthChange,
  onEdit,
  onCancel,
}: TimeOffTeamPanelProps) {
  const { t } = useTranslation();
  const locale = useTimeOffFormatLocale();
  const { from, to } = monthRange(month);
  const calendar = useTimeOffCalendar(workspaceId, from, to, { lang: locale });
  const users = useGetActiveWorkspaceUsers(workspaceId);
  const members = useMemo(
    () => timelineMembers(users.data?.members ?? [], viewerId, locale),
    [users.data, viewerId, locale],
  );
  const byUser = useMemo(
    () => entriesByUser(calendar.data?.entries ?? []),
    [calendar.data],
  );
  const holidaysOf = useMemo(
    () => holidaysByUser(calendar.data?.holidays ?? []),
    [calendar.data],
  );

  let content = <TimeOffTimelineSkeleton />;
  if (calendar.data && users.data) {
    content = (
      <>
        {calendar.data.entries.length === 0 &&
        calendar.data.holidays.length === 0 &&
        !calendar.isPlaceholderData ? (
          <p role="status" className="px-3 py-2 text-muted-foreground text-xs">
            {t("team:timeOff.timeline.empty")}
          </p>
        ) : null}
        <TimeOffTimeline
          month={month}
          members={members}
          entriesByUser={byUser}
          holidaysByUser={holidaysOf}
          viewerId={viewerId}
          today={today}
          busy={calendar.isPlaceholderData}
          onEdit={onEdit}
          onCancel={onCancel}
        />
      </>
    );
  } else if (calendar.isError || users.isError) {
    content = (
      <TimeOffLoadError
        message={t("team:timeOff.loadError")}
        retrying={calendar.isFetching || users.isFetching}
        onRetry={() => {
          if (calendar.isError) void calendar.refetch();
          if (users.isError) void users.refetch();
        }}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <TimeOffMonthNav month={month} today={today} onChange={onMonthChange} />
      </div>
      {content}
    </div>
  );
}
