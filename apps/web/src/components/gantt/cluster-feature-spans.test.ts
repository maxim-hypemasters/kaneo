import { format, parseISO } from "date-fns";
import { describe, expect, it } from "vite-plus/test";
import { clusterFeatureSpans } from "./cluster-feature-spans";
import type { GanttFeatureSpan } from "./gantt-types";

const span = (
  featureId: string,
  start: string,
  end: string,
): GanttFeatureSpan => ({
  featureId,
  title: featureId,
  start: parseISO(start),
  end: parseISO(end),
  taskCount: 1,
});

const summary = (spans: GanttFeatureSpan[]) =>
  clusterFeatureSpans(spans).map((cluster) => ({
    start: format(cluster.start, "yyyy-MM-dd"),
    end: format(cluster.end, "yyyy-MM-dd"),
    features: cluster.features.map((feature) => feature.featureId),
  }));

describe("clusterFeatureSpans", () => {
  it("returns no clusters for no spans", () => {
    expect(clusterFeatureSpans([])).toEqual([]);
  });

  it("joins spans that overlap, also through one in between, in start order", () => {
    expect(
      summary([
        span("late", "2026-09-20", "2026-09-22"),
        span("long", "2026-09-03", "2026-09-10"),
        span("bridge", "2026-09-09", "2026-09-14"),
        span("inside", "2026-09-04", "2026-09-05"),
      ]),
    ).toEqual([
      {
        start: "2026-09-03",
        end: "2026-09-14",
        features: ["long", "inside", "bridge"],
      },
      { start: "2026-09-20", end: "2026-09-22", features: ["late"] },
    ]);
  });

  it("joins a span starting on the day another ends, not the day after", () => {
    expect(
      summary([
        span("a", "2026-09-01", "2026-09-03"),
        span("b", "2026-09-03", "2026-09-04"),
        span("c", "2026-09-05", "2026-09-06"),
      ]),
    ).toEqual([
      { start: "2026-09-01", end: "2026-09-04", features: ["a", "b"] },
      { start: "2026-09-05", end: "2026-09-06", features: ["c"] },
    ]);
  });
});
