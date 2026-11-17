import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { shiftMonth, toMonthParam } from "@/lib/time-off/time-off-month";
import { useTimeOffFormatLocale } from "./use-time-off-format-locale";

type TimeOffMonthNavProps = {
  // YYYY-MM.
  month: string;
  // The viewer's local day, YYYY-MM-DD.
  today: string;
  onChange: (month: string) => void;
};

export function TimeOffMonthNav({
  month,
  today,
  onChange,
}: TimeOffMonthNavProps) {
  const { t } = useTranslation();
  const locale = useTimeOffFormatLocale();
  const current = toMonthParam(today);
  const label = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

  return (
    <div
      role="group"
      aria-label={t("team:timeOff.monthNav.label")}
      className="flex items-center gap-1"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("tasks:calendar.previousMonth")}
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <h2
        aria-live="polite"
        className="min-w-32 text-center font-medium text-sm tabular-nums"
      >
        {label}
      </h2>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("tasks:calendar.nextMonth")}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={month === current}
        onClick={() => onChange(current)}
      >
        {t("tasks:calendar.today")}
      </Button>
    </div>
  );
}
