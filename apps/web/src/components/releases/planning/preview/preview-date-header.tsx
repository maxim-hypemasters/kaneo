import { format, isSameMonth, isToday, isWeekend } from "date-fns";
import { useTranslation } from "react-i18next";
import type { GanttTimeline } from "@/components/gantt/timeline";
import type { ReleaseMarkerDay } from "@/components/gantt/release-marker-days";
import { RELEASE_DATE_KINDS } from "@/components/releases/release-date-kinds";
import { cn } from "@/lib/cn";
import { parseReleaseDate } from "@/lib/releases/release-date";

export function PreviewDateHeader({
  timeline,
  markerDays,
  dayWidthRem,
}: {
  timeline: GanttTimeline;
  markerDays: ReleaseMarkerDay[];
  dayWidthRem: number;
}) {
  const { t } = useTranslation();
  return (
    <div
      data-gantt-preview-date-header=""
      className="sticky top-0 z-30 flex bg-background"
    >
      <div
        className="border-b"
        style={{ width: `${timeline.timelineMinWidthRem}rem` }}
      >
        <div
          className="grid"
          style={{ gridTemplateColumns: timeline.gridTemplateColumns }}
        >
          {timeline.days.map((day, index) => (
            <div
              key={day.toISOString()}
              aria-current={isToday(day) ? "date" : undefined}
              className={cn(
                "border-r border-border/70 px-0.5 py-2 text-center",
                isWeekend(day) && "bg-muted/25",
              )}
            >
              <p className="h-4 text-[10px] text-muted-foreground">
                {index === 0 ||
                !isSameMonth(day, timeline.days[index - 1] ?? day)
                  ? format(day, "MMM")
                  : ""}
              </p>
              <span
                className={cn(
                  "mx-auto flex size-6 items-center justify-center rounded-full text-xs font-medium",
                  isToday(day) && "bg-primary text-primary-foreground",
                )}
              >
                {format(day, "d")}
              </span>
            </div>
          ))}
        </div>
        <div
          className="relative h-6 border-t border-border/70"
          aria-label={t("tasks:releases.gantt.strip")}
        >
          {markerDays.map((day) => (
            <div
              key={day.date}
              className="absolute inset-y-0 flex items-center justify-center gap-0.5"
              style={{
                left: `${day.index * dayWidthRem}rem`,
                width: `${dayWidthRem}rem`,
              }}
            >
              {day.releases.flatMap((release) =>
                release.kinds.map((kind) => {
                  const style = RELEASE_DATE_KINDS[kind];
                  const Icon = style.icon;
                  const label = `${t(style.labelKey)}: ${format(parseReleaseDate(day.date), "MMM d, yyyy")}`;
                  return (
                    <span
                      key={`${release.id}:${kind}`}
                      role="img"
                      aria-label={label}
                      title={label}
                    >
                      <Icon
                        aria-hidden="true"
                        className={cn("size-3", style.iconClassName)}
                      />
                    </span>
                  );
                }),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
