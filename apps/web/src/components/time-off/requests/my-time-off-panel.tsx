import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { TimeOffRequest } from "@/fetchers/time-off/types";
import { useTimeOffBalance } from "@/hooks/queries/time-off/use-time-off-balance";
import { useTimeOffRequests } from "@/hooks/queries/time-off/use-time-off-requests";
import { monthYear, shiftMonth } from "@/lib/time-off/time-off-month";
import { HolidayCalendarCard } from "../holidays/holiday-calendar-card";
import { TimeOffLoadError } from "../time-off-load-error";
import { TimeOffYearNav } from "../time-off-year-nav";
import { HolidayCalendarReminder } from "./holiday-calendar-reminder";
import { TimeOffBalanceCard } from "./time-off-balance-card";
import { TimeOffRequestList } from "./time-off-request-list";
import { TimeOffRequestsSkeleton } from "./time-off-requests-skeleton";

type MyTimeOffPanelProps = {
  workspaceId: string;
  // YYYY-MM; the panel shows its Jan-Dec year.
  month: string;
  today: string;
  onMonthChange: (month: string) => void;
  onEdit: (request: TimeOffRequest) => void;
  onCancel: (request: TimeOffRequest) => void;
  onRequest?: () => void;
  // Choosing your holiday calendar needs time_off:create.
  canEditHolidayCalendar: boolean;
  // Approvers' own calendar changes apply at once (time_off:approve).
  canApprove: boolean;
};

export function MyTimeOffPanel({
  workspaceId,
  month,
  today,
  onMonthChange,
  onEdit,
  onCancel,
  onRequest,
  canEditHolidayCalendar,
  canApprove,
}: MyTimeOffPanelProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const year = monthYear(month);
  const requests = useTimeOffRequests(workspaceId, year);
  const balance = useTimeOffBalance(workspaceId, year);
  // Placeholder data from another year must not pass for this one.
  const currentRequests =
    requests.data && !requests.isPlaceholderData ? requests.data : undefined;
  const currentBalance =
    balance.data && !balance.isPlaceholderData ? balance.data : undefined;
  const title = t("team:timeOff.requests.title", { year });

  let list = <TimeOffRequestsSkeleton />;
  if (currentRequests) {
    list = (
      <TimeOffRequestList
        requests={currentRequests.requests}
        year={year}
        today={today}
        label={title}
        onEdit={onEdit}
        onCancel={onCancel}
        onRequest={onRequest}
      />
    );
  } else if (requests.isError) {
    list = (
      <TimeOffLoadError
        className="rounded-xl border"
        message={t("team:timeOff.requests.loadError")}
        retrying={requests.isFetching}
        onRetry={() => void requests.refetch()}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <TimeOffYearNav
          year={year}
          onChange={(next) =>
            onMonthChange(shiftMonth(month, (next - year) * 12))
          }
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto grid w-full max-w-5xl gap-4 p-3 sm:p-4 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
          <HolidayCalendarReminder
            workspaceId={workspaceId}
            year={year}
            today={today}
            canEdit={canEditHolidayCalendar}
            canApprove={canApprove}
            className="lg:col-span-2"
          />
          <div className="flex flex-col gap-4">
            <TimeOffBalanceCard
              year={year}
              balance={currentBalance}
              isError={balance.isError}
              retrying={balance.isFetching}
              onRetry={() => void balance.refetch()}
            />
            <HolidayCalendarCard
              workspaceId={workspaceId}
              year={year}
              today={today}
              canEdit={canEditHolidayCalendar}
            />
          </div>
          <section aria-labelledby={headingId} className="flex flex-col gap-2">
            <h2 id={headingId} className="font-medium text-sm">
              {title}
            </h2>
            {list}
          </section>
        </div>
      </div>
    </div>
  );
}
