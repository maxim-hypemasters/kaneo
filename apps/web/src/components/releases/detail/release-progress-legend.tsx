import { useTranslation } from "react-i18next";
import type { ReleaseProgressCounts } from "@/types/release-progress";

type ReleaseProgressLegendProps = {
  counts: ReleaseProgressCounts;
  predicted: number;
};

export function ReleaseProgressLegend({
  counts,
  predicted,
}: ReleaseProgressLegendProps) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language, {
    maximumFractionDigits: 1,
  });
  const rows = [
    { key: "predicted", color: "bg-muted-foreground/60", value: predicted },
    { key: "started", color: "bg-amber-500", value: counts.started },
    { key: "completed", color: "bg-indigo-500", value: counts.completed },
  ] as const;

  return (
    <dl className="grid grid-cols-3 gap-3 lg:grid-cols-1 lg:gap-0">
      {rows.map(({ key, color, value }) => (
        <div
          key={key}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-border/70 py-3 text-xs lg:border-b lg:last:border-b-0"
        >
          <dt className="flex items-center gap-2 text-muted-foreground">
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-xs ${color}`}
            />
            {t(`tasks:releases.chart.${key}`)}
          </dt>
          <dd className="flex items-center gap-2 tabular-nums">
            <span className="font-medium">{number.format(value)}</span>
            <span className="text-muted-foreground">
              {number.format(
                counts.scope === 0
                  ? 0
                  : Math.round((value / counts.scope) * 100),
              )}
              %
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
