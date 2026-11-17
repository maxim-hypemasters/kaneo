import {
  formatReleaseDate,
  formatReleaseRange,
} from "@/lib/releases/release-date";
import { type AwayRun, runDates } from "./away-runs";

// The runs' dates in words, e.g. "Jan 5 – 7, Jan 11"; `labelOf` adds what
// each run is in parentheses.
export function awayNoteDates(
  runs: readonly AwayRun[],
  rangeStart: Date,
  today: string,
  labelOf?: (run: AwayRun) => string,
) {
  return runs
    .map((run) => {
      const { startDate, endDate } = runDates(run, rangeStart);
      const dates =
        startDate === endDate
          ? formatReleaseDate(startDate, { today })
          : formatReleaseRange(startDate, endDate, { today });
      return labelOf ? `${dates} (${labelOf(run)})` : dates;
    })
    .join(", ");
}
