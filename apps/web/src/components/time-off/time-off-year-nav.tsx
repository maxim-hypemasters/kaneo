import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type TimeOffYearNavProps = {
  year: number;
  onChange: (year: number) => void;
};

// Balances run Jan-Dec, so My time off and Balances step by year.
export function TimeOffYearNav({ year, onChange }: TimeOffYearNavProps) {
  const { t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t("team:timeOff.yearNav.label")}
      className="flex items-center gap-1"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("team:timeOff.yearNav.previous")}
        onClick={() => onChange(year - 1)}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <h2
        aria-live="polite"
        className="min-w-12 text-center font-medium text-sm tabular-nums"
      >
        {year}
      </h2>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("team:timeOff.yearNav.next")}
        onClick={() => onChange(year + 1)}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}
