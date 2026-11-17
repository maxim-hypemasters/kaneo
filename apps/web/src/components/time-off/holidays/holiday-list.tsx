import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { formatReleaseDate } from "@/lib/releases/release-date";
import { isWeekendDay } from "../timeline/day-of-week";

type HolidayListProps = {
  year: number;
  holidays: readonly { date: string; name: string }[];
  // The viewer's local day, YYYY-MM-DD.
  today: string;
};

// A calendar's holidays in a year. Weekend ones cost no allowance, so they
// say so; past ones are muted.
export function HolidayList({ year, holidays, today }: HolidayListProps) {
  const { t } = useTranslation();

  return (
    <ul
      aria-label={t("team:timeOff.holidays.listLabel", { year })}
      className="flex flex-col divide-y text-sm"
    >
      {holidays.map((holiday) => {
        const weekend = isWeekendDay(holiday.date);
        return (
          <li
            key={holiday.date}
            className={cn(
              "flex items-baseline justify-between gap-3 py-1.5",
              holiday.date < today && "text-muted-foreground",
            )}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate" title={holiday.name}>
                {holiday.name}
              </span>
              {weekend ? (
                <span className="text-muted-foreground text-xs">
                  {t("team:timeOff.holidays.weekend")}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {formatReleaseDate(holiday.date, { today })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
