import { useId } from "react";
import type { ReleaseDates } from "@/types/release";
import type { ReleaseProgressHistory } from "@/types/release-progress";
import {
  CHART_BOTTOM,
  CHART_HEIGHT,
  CHART_TOP,
  CHART_WIDTH,
  progressAreaPath,
  progressCurvePath,
  type releaseProgressGeometry,
} from "./release-progress-geometry";
import { predictedProgressPath } from "./release-progress-prediction";

type ReleaseProgressPlotProps = {
  release: ReleaseDates;
  history: ReleaseProgressHistory;
  geometry: ReturnType<typeof releaseProgressGeometry>;
  activeIndex: number | null;
};

export function ReleaseProgressPlot({
  release,
  history,
  geometry,
  activeIndex,
}: ReleaseProgressPlotProps) {
  const id = useId();
  const lastIndex = history.points.length - 1;
  const selected =
    history.points[Math.min(activeIndex ?? lastIndex, lastIndex)];
  const todayInRange =
    history.today >= release.startDate && history.today <= geometry.endDate;
  const series = [
    { key: "started", color: "text-amber-500" },
    { key: "completed", color: "text-indigo-500" },
  ] as const;
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      className="h-full w-full overflow-visible"
    >
      <defs>
        <pattern
          id={`${id}-gap`}
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(30)"
        >
          <line
            x1="0"
            x2="0"
            y1="0"
            y2="7"
            stroke="currentColor"
            className="text-muted-foreground/15"
            strokeWidth="2"
          />
        </pattern>
        {(["started", "completed"] as const).map((key) => (
          <linearGradient
            key={key}
            id={`${id}-${key}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor="currentColor"
              stopOpacity="0.22"
              className={
                key === "started" ? "text-amber-500" : "text-indigo-500"
              }
            />
            <stop
              offset="100%"
              stopColor="currentColor"
              stopOpacity="0"
              className={
                key === "started" ? "text-amber-500" : "text-indigo-500"
              }
            />
          </linearGradient>
        ))}
      </defs>
      {geometry.unknownUntil > 0 ? (
        <rect
          x="0"
          y={CHART_TOP}
          width={geometry.unknownUntil}
          height={CHART_BOTTOM - CHART_TOP}
          fill={`url(#${id}-gap)`}
        />
      ) : null}
      <line
        x1="0"
        x2={CHART_WIDTH}
        y1={CHART_BOTTOM}
        y2={CHART_BOTTOM}
        stroke="currentColor"
        className="text-border"
      />
      <line
        data-marker="start"
        x1={geometry.x(release.startDate)}
        x2={geometry.x(release.startDate)}
        y1={CHART_TOP}
        y2={CHART_BOTTOM}
        stroke="currentColor"
        strokeDasharray="2 3"
        className="text-success/40"
      />
      <line
        data-marker="submission"
        x1={geometry.x(release.submissionDate)}
        x2={geometry.x(release.submissionDate)}
        y1={CHART_TOP}
        y2={CHART_BOTTOM}
        stroke="currentColor"
        strokeDasharray="2 3"
        className="text-muted-foreground/40"
      />
      <line
        x1={geometry.x(release.codeFreezeDate)}
        x2={geometry.x(release.codeFreezeDate)}
        y1={CHART_TOP}
        y2={CHART_BOTTOM}
        stroke="currentColor"
        strokeDasharray="3 5"
        className="text-sky-500/40"
      />
      {todayInRange ? (
        <line
          x1={geometry.x(history.today)}
          x2={geometry.x(history.today)}
          y1={CHART_TOP}
          y2={CHART_BOTTOM}
          stroke="currentColor"
          strokeDasharray="3 5"
          className="text-indigo-500/45"
        />
      ) : null}
      {(["started", "completed"] as const).map((key) => (
        <path
          key={key}
          d={progressAreaPath(history.points, key, geometry)}
          fill={`url(#${id}-${key})`}
        />
      ))}
      <path
        data-series="predicted"
        d={predictedProgressPath(release, history.current.scope, geometry)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeDasharray="3 4"
        vectorEffect="non-scaling-stroke"
        className="text-muted-foreground/65"
      />
      {series.map(({ key, color }) => (
        <path
          key={key}
          data-series={key}
          d={progressCurvePath(history.points, key, geometry)}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={color}
        />
      ))}
      {selected && activeIndex !== null ? (
        <line
          x1={geometry.x(selected.date)}
          x2={geometry.x(selected.date)}
          y1={CHART_TOP}
          y2={CHART_BOTTOM}
          stroke="currentColor"
          className="text-muted-foreground/50"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {selected
        ? series.map(({ key, color }) => (
            <circle
              key={key}
              cx={geometry.x(
                (activeIndex === null ? history.points[lastIndex] : selected)
                  .date,
              )}
              cy={geometry.y(
                (activeIndex === null ? history.points[lastIndex] : selected)[
                  key
                ],
              )}
              r="2.5"
              fill="currentColor"
              className={color}
            />
          ))
        : null}
    </svg>
  );
}
