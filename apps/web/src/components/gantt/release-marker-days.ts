import {
  RELEASE_DATE_KIND_ORDER,
  RELEASE_DATE_KINDS,
} from "@/components/releases/release-date-kinds";
import { parseReleaseDate } from "@/lib/releases/release-date";
import type { ReleaseDateKind, ReleaseDates } from "@/types/release";
import type { GanttTimeline } from "./timeline";
import { dayColumn, isWeekendDay } from "./weekend-columns";

export type ReleaseMarkerDay = {
  // The day's column in the rendered days.
  index: number;
  // A date on a hidden weekend has no column: its line is pinned to the left
  // edge of the next working day's, the Friday/Monday boundary.
  pinned: boolean;
  // The first date placed here. A pinned marker holds both weekend days, so
  // each release entry carries its own date.
  date: string;
  // Each release with a date on this day, in the order given, one entry per
  // date, with its kinds of date in date order.
  releases: {
    id: string;
    name: string;
    date: string;
    kinds: ReleaseDateKind[];
  }[];
};

// The rendered days that hold a release date, in day order.
export function releaseMarkerDays(
  releases: readonly (ReleaseDates & { id: string; name: string })[],
  timeline: Pick<GanttTimeline, "rangeStart" | "days" | "hideWeekends">,
): ReleaseMarkerDay[] {
  const byPosition = new Map<string, ReleaseMarkerDay>();
  for (const release of releases) {
    for (const kind of RELEASE_DATE_KIND_ORDER) {
      const date = release[RELEASE_DATE_KINDS[kind].field];
      const releaseDate = parseReleaseDate(date);
      const index = dayColumn(
        releaseDate,
        timeline.rangeStart,
        timeline.hideWeekends,
      );
      if (index < 0 || index >= timeline.days.length) continue;
      const pinned = timeline.hideWeekends && isWeekendDay(releaseDate);
      const key = `${index}:${pinned}`;
      const day = byPosition.get(key) ?? {
        index,
        pinned,
        date,
        releases: [],
      };
      byPosition.set(key, day);
      const entry = day.releases.find(
        (item) => item.id === release.id && item.date === date,
      );
      if (entry) {
        entry.kinds.push(kind);
      } else {
        day.releases.push({
          id: release.id,
          name: release.name,
          date,
          kinds: [kind],
        });
      }
    }
  }
  // A pinned marker sits left of the working day's own.
  return [...byPosition.values()].sort(
    (left, right) =>
      left.index - right.index || Number(right.pinned) - Number(left.pinned),
  );
}
