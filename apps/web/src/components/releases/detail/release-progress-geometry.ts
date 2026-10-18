import { addDays, differenceInCalendarDays } from "date-fns";
import { parseReleaseDate, toReleaseDate } from "@/lib/releases/release-date";
import type { ReleaseDates } from "@/types/release";
import type { ReleaseProgressPoint } from "@/types/release-progress";

export const CHART_WIDTH = 1000;
export const CHART_TOP = 20;
export const CHART_BOTTOM = 160;
export const CHART_HEIGHT = 170;

export function progressTrackingDay(trackedFrom: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(trackedFrom));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function releaseProgressGeometry(
  release: ReleaseDates,
  points: readonly ReleaseProgressPoint[],
  trackingDay: string,
  currentScope = 0,
) {
  const start = parseReleaseDate(release.startDate);
  const endDate = [
    release.submissionDate,
    points.at(-1)?.date ?? release.startDate,
    trackingDay,
  ].reduce((latest, date) => (date > latest ? date : latest));
  const days = differenceInCalendarDays(parseReleaseDate(endDate), start);
  const x = (date: string) =>
    days === 0
      ? CHART_WIDTH / 2
      : Math.max(
          0,
          Math.min(
            CHART_WIDTH,
            (differenceInCalendarDays(parseReleaseDate(date), start) / days) *
              CHART_WIDTH,
          ),
        );
  const max = points.reduce(
    (value, point) => Math.max(value, point.scope),
    Math.max(1, currentScope),
  );
  const y = (count: number) =>
    CHART_BOTTOM - (count / max) * (CHART_BOTTOM - CHART_TOP);
  const tickCount = Math.min(5, days + 1);
  const tickDays = Array.from(
    new Set(
      Array.from({ length: tickCount }, (_, index) =>
        Math.round((index * days) / Math.max(1, tickCount - 1)),
      ),
    ),
  );
  const ticks = tickDays.map((day) => {
    const date = toReleaseDate(addDays(start, day));
    return { date, x: x(date) };
  });

  return {
    endDate,
    x,
    y,
    ticks,
    unknownUntil: trackingDay > release.startDate ? x(trackingDay) : 0,
  };
}

export function progressCurvePath(
  points: readonly ReleaseProgressPoint[],
  key: "started" | "completed",
  geometry: ReturnType<typeof releaseProgressGeometry>,
) {
  return points
    .map((point, index) => {
      const x = geometry.x(point.date);
      const y = geometry.y(point[key]);
      if (index === 0) return `M${x},${y}`;
      const previous = points[index - 1];
      const previousX = geometry.x(previous.date);
      const previousY = geometry.y(previous[key]);
      const third = (x - previousX) / 3;
      // Horizontal tangents keep plateaus flat and curves within daily totals.
      return `C${previousX + third},${previousY} ${x - third},${y} ${x},${y}`;
    })
    .join("");
}

export function progressAreaPath(
  points: readonly ReleaseProgressPoint[],
  key: "started" | "completed",
  geometry: ReturnType<typeof releaseProgressGeometry>,
) {
  if (points.length === 0) return "";
  return `${progressCurvePath(points, key, geometry)}L${geometry.x(points[points.length - 1].date)},${CHART_BOTTOM}H${geometry.x(points[0].date)}Z`;
}

export function nearestProgressPoint(
  points: readonly ReleaseProgressPoint[],
  position: number,
  geometry: ReturnType<typeof releaseProgressGeometry>,
) {
  let nearest = 0;
  let distance = Infinity;
  for (const [index, point] of points.entries()) {
    const next = Math.abs(geometry.x(point.date) - position);
    if (next < distance) {
      nearest = index;
      distance = next;
    }
  }
  return nearest;
}
