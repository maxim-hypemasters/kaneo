import { describe, expect, it } from "vite-plus/test";
import {
  CHART_BOTTOM,
  CHART_WIDTH,
  nearestProgressPoint,
  progressAreaPath,
  progressCurvePath,
  progressTrackingDay,
  releaseProgressGeometry,
} from "./release-progress-geometry";

const release = {
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-15",
  submissionDate: "2026-10-21",
};
const points = [
  { date: "2026-10-05", scope: 4, started: 1, completed: 0 },
  { date: "2026-10-06", scope: 6, started: 3, completed: 2 },
  { date: "2026-10-07", scope: 3, started: 2, completed: 1 },
];

describe("release progress geometry", () => {
  it("leaves unknown history and future dates outside the data paths", () => {
    const geometry = releaseProgressGeometry(release, points, "2026-10-05");
    expect(geometry.endDate).toBe("2026-10-21");
    expect(geometry.unknownUntil).toBe(200);
    expect(geometry.x(points[0].date)).toBe(200);
    expect(geometry.x(points[2].date)).toBe(300);
    const path = progressCurvePath(points, "started", geometry);
    expect(path).toMatch(/^M200,/);
    expect(path).toContain(" 250,90C");
    expect(path).toMatch(/ 300,[\d.]+$/);
    expect(
      progressAreaPath(points, "started", geometry).endsWith(
        `L300,${CHART_BOTTOM}H200Z`,
      ),
    ).toBe(true);
  });

  it("extends beyond submission only to recorded history or tracking start", () => {
    const latePoints = [{ ...points[0], date: "2026-10-25" }];
    expect(
      releaseProgressGeometry(release, latePoints, "2026-10-05").endDate,
    ).toBe("2026-10-25");
    const unknown = releaseProgressGeometry(release, [], "2026-10-30");
    expect(unknown.endDate).toBe("2026-10-30");
    expect(unknown.unknownUntil).toBe(CHART_WIDTH);
  });

  it("smooths historical scope additions and removals using the same daily bounds", () => {
    const geometry = releaseProgressGeometry(release, points, "2026-10-05", 3);
    const path = progressCurvePath(points, "scope", geometry);
    expect(path).toMatch(/^M200,/);
    const segments = [...path.matchAll(/C([\d.,\s-]+)/g)].map((match) =>
      match[1]
        .trim()
        .split(/[\s,]+/)
        .map(Number),
    );
    expect(segments).toHaveLength(2);
    for (const [index, segment] of segments.entries()) {
      const start = geometry.y(points[index].scope);
      const end = geometry.y(points[index + 1].scope);
      expect(segment[1]).toBe(start);
      expect(segment[3]).toBe(end);
      expect(segment.slice(4)).toEqual([
        geometry.x(points[index + 1].date),
        end,
      ]);
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const y =
          (1 - t) ** 3 * start +
          3 * (1 - t) ** 2 * t * segment[1] +
          3 * (1 - t) * t ** 2 * segment[3] +
          t ** 3 * end;
        expect(y).toBeGreaterThanOrEqual(Math.min(start, end));
        expect(y).toBeLessThanOrEqual(Math.max(start, end));
      }
    }
    expect(path).toMatch(/ 300,[\d.]+$/);
  });

  it("smooths rises, plateaus and falls without overshoot or crossing the started line", () => {
    const samples = [
      { date: "2026-10-05", scope: 6, started: 0, completed: 0 },
      { date: "2026-10-06", scope: 6, started: 6, completed: 2 },
      { date: "2026-10-07", scope: 6, started: 6, completed: 2 },
      { date: "2026-10-08", scope: 6, started: 3, completed: 3 },
      { date: "2026-10-09", scope: 6, started: 0, completed: 0 },
    ];
    const geometry = releaseProgressGeometry(release, samples, samples[0].date);
    const curves = (["started", "completed"] as const).map((key) => {
      const path = progressCurvePath(samples, key, geometry);
      expect(progressAreaPath(samples, key, geometry).startsWith(path)).toBe(
        true,
      );
      const segments = [...path.matchAll(/C([\d.,\s-]+)/g)].map((match) =>
        match[1]
          .trim()
          .split(/[\s,]+/)
          .map(Number),
      );
      expect(segments).toHaveLength(samples.length - 1);
      return segments.map((segment, index) => {
        const startY = geometry.y(samples[index][key]);
        const endY = geometry.y(samples[index + 1][key]);
        expect(segment[1]).toBe(startY);
        expect(segment[3]).toBe(endY);
        expect(segment.slice(4)).toEqual([
          geometry.x(samples[index + 1].date),
          endY,
        ]);
        return [0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y =
            (1 - t) ** 3 * startY +
            3 * (1 - t) ** 2 * t * segment[1] +
            3 * (1 - t) * t ** 2 * segment[3] +
            t ** 3 * endY;
          expect(y).toBeGreaterThanOrEqual(Math.min(startY, endY));
          expect(y).toBeLessThanOrEqual(Math.max(startY, endY));
          return y;
        });
      });
    });
    for (const [index, values] of curves[0].entries()) {
      for (const [sample, startedY] of values.entries()) {
        expect(curves[1][index][sample]).toBeGreaterThanOrEqual(startedY);
      }
    }
  });

  it("uses calendar days across a daylight saving change", () => {
    const geometry = releaseProgressGeometry(
      { ...release, startDate: "2026-10-24", submissionDate: "2026-10-26" },
      [],
      "2026-10-24",
    );
    expect(geometry.x("2026-10-25")).toBe(CHART_WIDTH / 2);
    expect(geometry.ticks.map((tick) => tick.date)).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
    ]);
  });

  it("handles zero tasks, no points and a one-day release without invalid coordinates", () => {
    const geometry = releaseProgressGeometry(
      { ...release, submissionDate: release.startDate },
      [{ date: release.startDate, scope: 0, started: 0, completed: 0 }],
      release.startDate,
    );
    expect(geometry.x(release.startDate)).toBe(CHART_WIDTH / 2);
    expect(geometry.y(0)).toBe(CHART_BOTTOM);
    expect(geometry.ticks).toHaveLength(1);
    expect(progressAreaPath([], "started", geometry)).toBe("");
    expect(progressCurvePath([], "started", geometry)).toBe("");
    expect(
      progressCurvePath(
        [{ date: release.startDate, scope: 0, started: 0, completed: 0 }],
        "started",
        geometry,
      ),
    ).toBe(`M${CHART_WIDTH / 2},${CHART_BOTTOM}`);
  });

  it("scales to current scope before any history and preserves larger historical scope", () => {
    const upcoming = releaseProgressGeometry(release, [], "2026-09-30", 8);
    expect(upcoming.y(8)).toBe(20);
    const historical = releaseProgressGeometry(
      release,
      [{ ...points[0], scope: 10 }],
      "2026-10-05",
      8,
    );
    expect(historical.y(10)).toBe(20);
    expect(historical.y(8)).toBe(48);
  });

  it("picks the nearest recorded day and clamps outside the plotted range", () => {
    const geometry = releaseProgressGeometry(release, points, "2026-10-05");
    expect(nearestProgressPoint(points, -50, geometry)).toBe(0);
    expect(nearestProgressPoint(points, 252, geometry)).toBe(1);
    expect(nearestProgressPoint(points, 900, geometry)).toBe(2);
  });

  it("converts tracking instants to the same calendar as the API query", () => {
    expect(
      progressTrackingDay("2026-10-18T00:30:00Z", "America/Los_Angeles"),
    ).toBe("2026-10-17");
    expect(progressTrackingDay("2026-10-18T00:30:00Z", "Europe/Belgrade")).toBe(
      "2026-10-18",
    );
  });
});
