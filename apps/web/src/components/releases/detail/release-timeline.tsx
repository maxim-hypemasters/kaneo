import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { ReleaseDates as ReleaseDateValues } from "@/types/release";
import { RELEASE_DATE_KINDS } from "../release-date-kinds";
import { ReleaseDates } from "../release-dates";
import { releaseTimelinePosition } from "./release-timeline-position";

type ReleaseTimelineProps = {
  release: ReleaseDateValues;
  today: string;
};

// Centres a marker's icon or label on it, kept inside the bar at either end.
function anchorAt(percent: number): CSSProperties {
  const shift = percent <= 0 ? "0%" : percent >= 100 ? "-100%" : "-50%";
  return { transform: `translateX(${shift})` };
}

// The bar is a picture of the dates below it, which screen readers read
// instead.
export function ReleaseTimeline({ release, today }: ReleaseTimelineProps) {
  const { t } = useTranslation();
  const position = releaseTimelinePosition(release, today);
  const markers = [
    { kind: "start", percent: 0 },
    { kind: "codeFreeze", percent: position.codeFreeze },
    { kind: "submission", percent: 100 },
  ] as const;

  return (
    <section
      aria-label={t("tasks:releases.detail.timelineLabel")}
      className="space-y-3"
    >
      <div aria-hidden="true" className="pt-5 pb-5">
        <div className="relative h-1.5 rounded-full bg-input">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary/40"
            style={{ width: `${position.today}%` }}
          />
          {markers.map(({ kind, percent }) => {
            const style = RELEASE_DATE_KINDS[kind];
            const Icon = style.icon;
            return (
              <div
                key={kind}
                className="absolute -top-1.5 -bottom-1.5"
                style={{ left: `${percent}%` }}
              >
                <div
                  className={cn(
                    "-translate-x-1/2 h-full border-l-2",
                    style.lineClassName,
                  )}
                />
                <Icon
                  className={cn(
                    "absolute top-full left-0 mt-1 size-3.5",
                    style.iconClassName,
                  )}
                  style={anchorAt(percent)}
                />
              </div>
            );
          })}
          {position.todayInRange ? (
            <div
              className="absolute -top-1 -bottom-1"
              style={{ left: `${position.today}%` }}
            >
              <div className="-translate-x-1/2 h-full w-1 rounded-full bg-primary ring-2 ring-card" />
              <span
                className="absolute bottom-full left-0 mb-1 whitespace-nowrap font-medium text-[10px] text-primary"
                style={anchorAt(position.today)}
              >
                {t("tasks:releases.detail.today")}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <ReleaseDates release={release} today={today} labels="visible" />
    </section>
  );
}
