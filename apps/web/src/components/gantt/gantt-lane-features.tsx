import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { clusterFeatureSpans } from "./cluster-feature-spans";
import { GanttFeatureOverflow } from "./gantt-feature-overflow";
import type { GanttFeatureSpan, GanttLaneFeature } from "./gantt-types";
import { type GanttTimeline, getBarGridColumns } from "./timeline";

type GanttLaneFeaturesProps = {
  features: readonly GanttLaneFeature[];
  overflowFeatures: readonly GanttFeatureSpan[];
  trackCount: number;
  timeline: GanttTimeline;
  // Width of the sticky task rail over the timeline (0 when it's hidden).
  railWidthRem: number;
  onOpenFeature: (featureId: string) => void;
  className?: string;
};

// A member's features, one bar per feature spanning their tasks in it, on
// as many stacked tracks as overlaps need. Every track renders even with
// nothing in view, so the header keeps its height while the timeline
// scrolls. z-[1]: above the dependency arrows (the fill is translucent so
// they still show), below a bar dragged between lanes (z-[10]), the sticky
// rail (z-[11]) and the drop overlay (z-[12]). Features that found no free
// track get a "+N" chip per group of overlapping ones, in the last track.
// Everything in a track sits on its one grid row: a chip overlaps the slices
// there, and auto placement would otherwise push it onto a second row.
export function GanttLaneFeatures({
  features,
  overflowFeatures,
  trackCount,
  timeline,
  railWidthRem,
  onOpenFeature,
  className,
}: GanttLaneFeaturesProps) {
  const { t } = useTranslation();
  if (trackCount === 0) return null;

  const dayCount = timeline.days.length;
  const columnsOf = (span: { start: Date; end: Date }) =>
    getBarGridColumns(span.start, span.end, timeline.rangeStart, dayCount);
  const overflowClusters = clusterFeatureSpans(overflowFeatures).flatMap(
    (cluster) => {
      const columns = columnsOf(cluster);
      return columns.barInView ? [{ ...cluster, columns }] : [];
    },
  );
  const tracks = Array.from({ length: trackCount }, (_, track) => ({
    track,
    slices: features.filter((feature) => feature.track === track),
  }));

  return (
    <div
      role="group"
      aria-label={t("tasks:gantt.featuresLabel")}
      className={cn("relative z-[1] flex flex-col gap-0.5", className)}
    >
      {tracks.map(({ track, slices }) => (
        <div
          key={track}
          data-gantt-feature-track={track}
          className="grid h-7 sm:h-6"
          style={{ gridTemplateColumns: timeline.gridTemplateColumns }}
        >
          {slices.map((feature) => {
            const columns = columnsOf(feature);
            if (!columns.barInView) return null;
            return (
              <button
                key={feature.featureId}
                type="button"
                aria-label={t("tasks:gantt.featureSliceAria", {
                  title: feature.title,
                  count: feature.taskCount,
                  start: format(feature.start, "MMM d, yyyy"),
                  end: format(feature.end, "MMM d, yyyy"),
                })}
                onClick={() => onOpenFeature(feature.featureId)}
                style={{
                  gridColumn: `${columns.lineStart} / ${columns.lineEnd}`,
                }}
                className={cn(
                  "relative row-start-1 flex min-w-0 cursor-pointer touch-manipulation items-center overflow-hidden border border-primary/30 bg-primary/10 px-1.5 text-left text-[11px] font-medium leading-none text-foreground transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  columns.clippedStart
                    ? "rounded-l-none border-l-0"
                    : "ml-1 rounded-l-md",
                  columns.clippedEnd
                    ? "rounded-r-none border-r-0"
                    : "mr-1 rounded-r-md",
                )}
              >
                <span className="truncate">{feature.title}</span>
              </button>
            );
          })}
          {track === trackCount - 1 &&
            overflowClusters.map(({ features: hidden, columns }) => (
              <GanttFeatureOverflow
                key={hidden[0]?.featureId}
                features={hidden}
                gridColumn={`${columns.lineStart} / ${columns.lineEnd}`}
                stickyLeftRem={railWidthRem}
                onOpenFeature={onOpenFeature}
              />
            ))}
        </div>
      ))}
    </div>
  );
}
