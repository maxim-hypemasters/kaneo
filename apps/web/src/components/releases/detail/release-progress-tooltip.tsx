import { useTranslation } from "react-i18next";
import { formatReleaseDate } from "@/lib/releases/release-date";
import type { ReleaseProgressPoint } from "@/types/release-progress";

type ReleaseProgressTooltipProps = {
  point: ReleaseProgressPoint;
  percent: number;
  today: string;
  predicted: number;
};

export function ReleaseProgressTooltip({
  point,
  percent,
  today,
  predicted,
}: ReleaseProgressTooltipProps) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language, {
    maximumFractionDigits: 1,
  });
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-md border bg-popover px-3 py-2 text-popover-foreground text-xs shadow-sm"
      style={{
        left: `${percent}%`,
        transform: `translateX(${percent < 25 ? 0 : percent > 75 ? -100 : -50}%)`,
      }}
    >
      <p className="mb-1.5 font-medium">
        {formatReleaseDate(point.date, { today })}
      </p>
      {(["predicted", "started", "completed"] as const).map((key) => (
        <div key={key} className="flex justify-between gap-4 leading-5">
          <span className="text-muted-foreground">
            {t(`tasks:releases.chart.${key}`)}
          </span>
          <span className="tabular-nums">
            {number.format(key === "predicted" ? predicted : point[key])}
          </span>
        </div>
      ))}
    </div>
  );
}
