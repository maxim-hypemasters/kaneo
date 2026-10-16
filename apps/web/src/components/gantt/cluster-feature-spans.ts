import { differenceInCalendarDays } from "date-fns";
import type { GanttFeatureSpan } from "./gantt-types";

export type GanttFeatureCluster = {
  start: Date;
  end: Date;
  features: GanttFeatureSpan[];
};

// Groups spans whose days overlap, directly or through spans in between, in
// start order. Bars include their end day, so a span starting on the day
// another ends joins it, the same rule packFeatureTracks uses.
export function clusterFeatureSpans(
  spans: readonly GanttFeatureSpan[],
): GanttFeatureCluster[] {
  const ordered = [...spans].sort(
    (left, right) =>
      left.start.getTime() - right.start.getTime() ||
      left.end.getTime() - right.end.getTime(),
  );
  const clusters: GanttFeatureCluster[] = [];

  for (const span of ordered) {
    const current = clusters[clusters.length - 1];
    if (current && differenceInCalendarDays(span.start, current.end) <= 0) {
      current.features.push(span);
      if (span.end > current.end) current.end = span.end;
      continue;
    }
    clusters.push({ start: span.start, end: span.end, features: [span] });
  }

  return clusters;
}
