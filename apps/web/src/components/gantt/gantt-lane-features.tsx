import { format } from "date-fns";
import { Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { clusterFeatureSpans } from "./cluster-feature-spans";
import { GanttFeatureOverflow } from "./gantt-feature-overflow";
import { GanttSummaryShape } from "./gantt-summary-shape";
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

// A member's features, one summary bar per feature spanning their tasks in
// it, on as many stacked tracks as overlaps need. Each track leaves room
// under its band for the bracket tips. Every track renders even with nothing
// in view, so the header keeps its height while the timeline scrolls. No
// z-index: the solid bands would hide dependency arrows crossing the header,
// so the arrows (z-[1]) draw over them, while a bar dragged between lanes
// (z-[10]), the sticky rail (z-[11]) and the drop overlay (z-[12]) still
// cover them. Features that found no free track get a "+N" chip per group of
// overlapping ones, in the last track. Everything in a track sits on its one
// grid row: a chip overlaps the slices there, and auto placement would
// otherwise push it onto a second row.
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
      className={cn("relative flex flex-col gap-0.5", className)}
    >
      {tracks.map(({ track, slices }) => (
        <div
          key={track}
          data-gantt-feature-track={track}
          className="grid h-8 sm:h-7"
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
                  "group/slice relative row-start-1 flex min-w-0 cursor-pointer touch-manipulation items-start text-left focus-visible:outline-hidden",
                  !columns.clippedStart && "ml-1",
                  !columns.clippedEnd && "mr-1",
                )}
              >
                {/* The band sits at the top of the track; its tips hang
                    into the room left below it. */}
                <GanttSummaryShape
                  clippedStart={columns.clippedStart}
                  clippedEnd={columns.clippedEnd}
                  className="inset-x-0 top-0 h-6 group-hover/slice:bg-primary/85 group-focus-visible/slice:ring-2 group-focus-visible/slice:ring-ring group-focus-visible/slice:ring-offset-1 group-focus-visible/slice:ring-offset-background sm:h-5"
                />
                <span className="relative flex h-6 min-w-0 items-center gap-1 px-1.5 text-[11px] font-semibold leading-none text-primary-foreground sm:h-5">
                  <Layers aria-hidden="true" className="size-3 shrink-0" />
                  <span className="truncate leading-tight">
                    {feature.title}
                  </span>
                </span>
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
