import { useTranslation } from "react-i18next";
import type { WeekStartDay } from "@/store/user-preferences";
import { cn } from "@/lib/cn";
import { useTimeOffFormatLocale } from "../use-time-off-format-locale";
import { dayOfWeek, isWeekendDay } from "./day-of-week";

type TimeOffDateHeaderProps = {
  days: readonly string[];
  today: string;
  weekStartsOn: WeekStartDay;
  gridTemplateColumns: string;
};

export function TimeOffDateHeader({
  days,
  today,
  weekStartsOn,
  gridTemplateColumns,
}: TimeOffDateHeaderProps) {
  const { t } = useTranslation();
  const locale = useTimeOffFormatLocale();
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "narrow",
    timeZone: "UTC",
  });
  const fullDate = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <div
      className="sticky top-0 z-20 grid border-b bg-background"
      style={{ gridTemplateColumns }}
    >
      <div className="sticky left-0 z-10 flex items-end border-r bg-background px-3 pb-2 text-muted-foreground text-xs">
        {t("team:timeOff.timeline.member")}
      </div>
      {days.map((day) => {
        const date = new Date(`${day}T00:00:00Z`);
        const isToday = day === today;
        const label = fullDate.format(date);
        return (
          <div
            key={day}
            aria-current={isToday ? "date" : undefined}
            title={label}
            className={cn(
              "flex flex-col items-center gap-0.5 border-l border-border/40 py-1.5 text-center",
              isWeekendDay(day) && "bg-muted/40",
              dayOfWeek(day) === weekStartsOn && "border-border",
            )}
          >
            <span
              aria-hidden="true"
              className="text-[10px] text-muted-foreground"
            >
              {weekday.format(date)}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 items-center justify-center rounded-full font-medium text-xs tabular-nums",
                isToday && "bg-primary text-primary-foreground",
              )}
            >
              {date.getUTCDate()}
            </span>
            <span className="sr-only">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
