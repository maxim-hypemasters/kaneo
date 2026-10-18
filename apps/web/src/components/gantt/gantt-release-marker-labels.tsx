import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { RELEASE_DATE_KINDS } from "@/components/releases/release-date-kinds";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { formatReleaseDate } from "@/lib/releases/release-date";
import { formatReleaseKinds } from "./format-release-kinds";
import { releaseMarkerLabelWidths } from "./release-marker-label-widths";
import type { ReleaseMarkerDay } from "./release-marker-days";
import type { GanttTimeline } from "./timeline";

// From a label's left edge to the centre of its first icon (padding plus half
// an icon), so that icon sits on the day's line.
const ICON_CENTRE_REM = 0.5;

type GanttReleaseMarkerLabelsProps = {
  days: readonly ReleaseMarkerDay[];
  timeline: GanttTimeline;
  dayColumnWidthRem: number;
  workspaceId: string;
  projectId: string;
  // The viewer's local day (YYYY-MM-DD), for when dates show their year.
  today: string;
};

// The strip under the header's days naming the release lines: each release
// date links to its release. Labels drop to icons where the next marker day
// leaves no room for a name.
export function GanttReleaseMarkerLabels({
  days,
  timeline,
  dayColumnWidthRem,
  workspaceId,
  projectId,
  today,
}: GanttReleaseMarkerLabelsProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n?.resolvedLanguage ?? i18n?.language;
  const widths = releaseMarkerLabelWidths(days, timeline.days.length);

  return (
    <ul
      aria-label={t("tasks:releases.gantt.strip")}
      // Clips vertically so the links' 44px touch hitboxes stay in the strip
      // instead of taking taps meant for the first chart row; their focus
      // rings are inset so the clip doesn't cut them.
      className="relative h-6 overflow-y-clip border-t border-border/70"
      style={{ width: `${timeline.timelineMinWidthRem}rem` }}
    >
      {days.map((day, position) => {
        const { roomDays, iconOnly } = widths[position];
        const date = formatReleaseDate(day.date, { today });
        return (
          <li
            key={day.date}
            className="absolute inset-y-0 flex items-center gap-0.5"
            style={{
              left: `${(day.index + 0.5) * dayColumnWidthRem - ICON_CENTRE_REM}rem`,
              maxWidth: `${roomDays * dayColumnWidthRem}rem`,
            }}
          >
            {day.releases.map((release) => {
              const label = t("tasks:releases.gantt.markerAria", {
                name: release.name,
                kind: formatReleaseKinds(
                  release.kinds.map((kind) =>
                    t(RELEASE_DATE_KINDS[kind].labelKey),
                  ),
                  locale,
                ),
                date,
              });
              return (
                <Tooltip key={release.id}>
                  <TooltipTrigger
                    render={
                      <Link
                        to="/dashboard/workspace/$workspaceId/project/$projectId/releases/$releaseId"
                        params={{
                          workspaceId,
                          projectId,
                          releaseId: release.id,
                        }}
                        aria-label={label}
                        className="touch-hitbox relative flex h-5 min-w-0 items-center gap-0.5 rounded-sm px-0.5 font-medium text-[11px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      />
                    }
                  >
                    {release.kinds.map((kind) => {
                      const { icon: Icon, iconClassName } =
                        RELEASE_DATE_KINDS[kind];
                      return (
                        <Icon
                          key={kind}
                          aria-hidden="true"
                          className={cn("size-3 shrink-0", iconClassName)}
                        />
                      );
                    })}
                    {iconOnly ? null : (
                      <span className="truncate">{release.name}</span>
                    )}
                  </TooltipTrigger>
                  <TooltipContent>{label}</TooltipContent>
                </Tooltip>
              );
            })}
          </li>
        );
      })}
    </ul>
  );
}
