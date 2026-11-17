import { RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemberHolidays } from "@/hooks/queries/time-off/use-member-holidays";
import { useTimeOffFormatLocale } from "../use-time-off-format-locale";
import { HolidayCalendarForm } from "./holiday-calendar-form";
import { HolidayCalendarPending } from "./holiday-calendar-pending";
import { HolidayList } from "./holiday-list";
import { useHolidayCalendarLabel } from "./use-holiday-calendar-label";

type HolidayCalendarCardProps = {
  workspaceId: string;
  year: number;
  // The viewer's local day, YYYY-MM-DD.
  today: string;
  // Choosing your own calendar needs time_off:create.
  canEdit: boolean;
};

// Your public holiday calendar and its holidays in a year. Its holidays
// count as approved time off without requests. A change after your free
// first choice waits for approval, shown above the calendar in effect.
export function HolidayCalendarCard({
  workspaceId,
  year,
  today,
  canEdit,
}: HolidayCalendarCardProps) {
  const { t } = useTranslation();
  const lang = useTimeOffFormatLocale();
  const calendarLabel = useHolidayCalendarLabel();
  const headingId = useId();
  const changeRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const wasEditing = useRef(false);
  const holidays = useMemberHolidays(workspaceId, year, { lang });
  const data = holidays.data;
  const needsApproval = data?.nextChangeNeedsApproval ?? false;

  // Closing the form hands focus back to the button that opened it.
  useEffect(() => {
    if (wasEditing.current && !editing) changeRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  let body = (
    <div role="status" className="flex flex-col gap-2">
      <span className="sr-only">{t("team:timeOff.loading")}</span>
      <Skeleton aria-hidden="true" className="h-4 w-2/3" />
      <Skeleton aria-hidden="true" className="h-12 w-full" />
    </div>
  );
  if (data && editing) {
    body = (
      <HolidayCalendarForm
        workspaceId={workspaceId}
        holidays={data}
        onDone={() => setEditing(false)}
      />
    );
  } else if (data?.calendar) {
    body = (
      <>
        <div className="flex flex-col gap-0.5">
          <p className="font-medium text-sm">{calendarLabel(data.calendar)}</p>
          <p className="text-muted-foreground text-xs">
            {t("team:timeOff.holidays.calendarHint")}
          </p>
        </div>
        {data.holidays.length > 0 ? (
          <HolidayList year={year} holidays={data.holidays} today={today} />
        ) : (
          <p className="text-muted-foreground text-xs">
            {t("team:timeOff.holidays.empty", { year })}
          </p>
        )}
      </>
    );
  } else if (data) {
    body = (
      <div className="flex flex-col gap-0.5">
        <p className="font-medium text-sm">
          {t("team:timeOff.holidays.noCalendar")}
        </p>
        <p className="text-muted-foreground text-xs">
          {t("team:timeOff.holidays.noCalendarHint")}
        </p>
      </div>
    );
  } else if (holidays.isError) {
    body = (
      <div role="alert" className="flex flex-col items-start gap-2 text-sm">
        <p className="text-muted-foreground">
          {t("team:timeOff.holidays.loadError")}
        </p>
        <Button
          variant="outline"
          size="xs"
          loading={holidays.isFetching}
          onClick={() => void holidays.refetch()}
        >
          <RotateCcw aria-hidden="true" />
          {t("common:error.tryAgain")}
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex h-fit flex-col gap-3 rounded-xl border bg-card p-4"
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h2 id={headingId} className="font-medium text-sm">
          {t("team:timeOff.holidays.title")}
        </h2>
        {canEdit && data && !editing ? (
          <Button
            ref={changeRef}
            variant="ghost"
            size="xs"
            aria-label={t(
              needsApproval
                ? "team:timeOff.holidays.requestChangeLabel"
                : "team:timeOff.holidays.changeLabel",
            )}
            onClick={() => setEditing(true)}
          >
            {t(
              needsApproval
                ? "team:timeOff.holidays.requestChange"
                : "team:timeOff.holidays.change",
            )}
          </Button>
        ) : null}
      </div>
      {data?.pendingRequest && !editing ? (
        <HolidayCalendarPending
          workspaceId={workspaceId}
          request={data.pendingRequest}
          canWithdraw={canEdit}
          onWithdrawn={() => changeRef.current?.focus()}
        />
      ) : null}
      {body}
    </section>
  );
}
