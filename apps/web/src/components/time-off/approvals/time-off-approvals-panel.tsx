import { CalendarCheck } from "lucide-react";
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useHolidayCalendarRequests } from "@/hooks/queries/time-off/use-holiday-calendar-requests";
import { usePendingTimeOffRequests } from "@/hooks/queries/time-off/use-pending-time-off-requests";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { TimeOffRequestsSkeleton } from "../requests/time-off-requests-skeleton";
import { timelineMembers } from "../timeline/timeline-members";
import { TimeOffLoadError } from "../time-off-load-error";
import { useTimeOffFormatLocale } from "../use-time-off-format-locale";
import { HolidayCalendarRequestsSection } from "./holiday-calendar-requests-section";
import { TimeOffApprovalRow } from "./time-off-approval-row";
import { useFocusAfterDecision } from "./use-focus-after-decision";

type TimeOffApprovalsPanelProps = {
  workspaceId: string;
  today: string;
};

// Approvers only: time off requests and then public holiday calendar
// changes waiting for a decision, each oldest first.
export function TimeOffApprovalsPanel({
  workspaceId,
  today,
}: TimeOffApprovalsPanelProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const viewerId = user?.id;
  const locale = useTimeOffFormatLocale();
  const headingId = useId();
  const pending = usePendingTimeOffRequests(workspaceId);
  const calendarRequests = useHolidayCalendarRequests(workspaceId, locale);
  const users = useGetActiveWorkspaceUsers(workspaceId);
  const focus = useFocusAfterDecision(pending.data?.requests);
  const membersById = useMemo(
    () =>
      new Map(
        timelineMembers(users.data?.members ?? [], viewerId, locale).map(
          (member) => [member.userId, member],
        ),
      ),
    [users.data, viewerId, locale],
  );

  let content = <TimeOffRequestsSkeleton />;
  if (pending.data && calendarRequests.data && users.data) {
    const requests = pending.data.requests;
    const calendars = calendarRequests.data.requests;
    content = (
      <>
        {requests.length === 0 && calendars.length === 0 ? (
          <Empty className="rounded-xl border py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarCheck aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle className="text-base">
                {t("team:timeOff.approvals.empty")}
              </EmptyTitle>
              <EmptyDescription>
                {t("team:timeOff.approvals.emptyHint")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {requests.length > 0 ? (
          <ul
            ref={focus.listRef}
            aria-labelledby={headingId}
            className="rounded-xl border bg-card"
          >
            {requests.map((request, index) => (
              <TimeOffApprovalRow
                key={request.id}
                workspaceId={workspaceId}
                request={request}
                member={membersById.get(request.userId)}
                isViewer={request.userId === viewerId}
                today={today}
                onDecided={() => focus.onDecided(request.id, index)}
              />
            ))}
          </ul>
        ) : null}
        <HolidayCalendarRequestsSection
          workspaceId={workspaceId}
          requests={calendars}
          membersById={membersById}
          viewerId={viewerId}
          today={today}
          lang={locale}
          fallbackFocusRef={focus.headingRef}
        />
      </>
    );
  } else if (pending.isError || calendarRequests.isError || users.isError) {
    content = (
      <TimeOffLoadError
        className="rounded-xl border"
        message={t("team:timeOff.approvals.loadError")}
        retrying={
          pending.isFetching || calendarRequests.isFetching || users.isFetching
        }
        onRetry={() => {
          if (pending.isError) void pending.refetch();
          if (calendarRequests.isError) void calendarRequests.refetch();
          if (users.isError) void users.refetch();
        }}
      />
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      <section
        aria-labelledby={headingId}
        className="mx-auto flex w-full max-w-5xl flex-col gap-2 p-3 sm:p-4"
      >
        <div className="flex flex-col gap-0.5">
          <h2
            ref={focus.headingRef}
            id={headingId}
            tabIndex={-1}
            className="font-medium text-sm outline-none"
          >
            {t("team:timeOff.approvals.title")}
          </h2>
          <p className="text-muted-foreground text-xs">
            {t("team:timeOff.approvals.hint")}
          </p>
        </div>
        {content}
      </section>
    </div>
  );
}
