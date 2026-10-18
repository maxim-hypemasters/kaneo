import { differenceInCalendarDays } from "date-fns";
import {
  RELEASE_DATE_KIND_ORDER,
  RELEASE_DATE_KINDS,
} from "@/components/releases/release-date-kinds";
import { parseReleaseDate } from "@/lib/releases/release-date";
import type { ReleaseDateKind, ReleaseDates } from "@/types/release";
import type { GanttTimeline } from "./timeline";

export type ReleaseMarkerDay = {
  // The day's column in the rendered days.
  index: number;
  date: string;
  // Each release with a date on this day, in the order given, with its kinds
  // of date in date order.
  releases: { id: string; name: string; kinds: ReleaseDateKind[] }[];
};

// The rendered days that hold a release date, in day order.
export function releaseMarkerDays(
  releases: readonly (ReleaseDates & { id: string; name: string })[],
  timeline: Pick<GanttTimeline, "rangeStart" | "days">,
): ReleaseMarkerDay[] {
  const byIndex = new Map<number, ReleaseMarkerDay>();
  for (const release of releases) {
    for (const kind of RELEASE_DATE_KIND_ORDER) {
      const date = release[RELEASE_DATE_KINDS[kind].field];
      const index = differenceInCalendarDays(
        parseReleaseDate(date),
        timeline.rangeStart,
      );
      if (index < 0 || index >= timeline.days.length) continue;
      const day = byIndex.get(index) ?? { index, date, releases: [] };
      byIndex.set(index, day);
      const entry = day.releases.find((item) => item.id === release.id);
      if (entry) {
        entry.kinds.push(kind);
      } else {
        day.releases.push({
          id: release.id,
          name: release.name,
          kinds: [kind],
        });
      }
    }
  }
  return [...byIndex.values()].sort((left, right) => left.index - right.index);
}
