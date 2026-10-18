import { describe, expect, it } from "vite-plus/test";
import { releaseProgressGeometry } from "./release-progress-geometry";
import {
  predictedProgress,
  predictedProgressPath,
} from "./release-progress-prediction";

const release = {
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-15",
  submissionDate: "2026-10-21",
};

describe("release predicted progress", () => {
  it("follows an even pace to code freeze and clamps dates outside that range", () => {
    expect(predictedProgress(release, 14, "2026-09-30")).toBe(0);
    expect(predictedProgress(release, 14, "2026-10-01")).toBe(0);
    expect(predictedProgress(release, 14, "2026-10-08")).toBe(7);
    expect(predictedProgress(release, 14, "2026-10-15")).toBe(14);
    expect(predictedProgress(release, 14, "2026-10-22")).toBe(14);
  });

  it("uses current scope rather than historical scope or completion speed", () => {
    expect(predictedProgress(release, 8, "2026-10-08")).toBe(4);
    expect(predictedProgress(release, 10, "2026-10-08")).toBe(5);
    expect(predictedProgress(release, 0, "2026-10-15")).toBe(0);
  });

  it("draws one straight guideline that stops at code freeze", () => {
    const geometry = releaseProgressGeometry(release, [], "2026-10-01", 14);
    const path = predictedProgressPath(release, 14, geometry);
    expect(path).toBe("M0,160L700,20");
  });

  it("draws a vertical guideline for same-day start and freeze", () => {
    const sameDay = { ...release, codeFreezeDate: release.startDate };
    const geometry = releaseProgressGeometry(sameDay, [], release.startDate, 8);
    expect(predictedProgressPath(sameDay, 8, geometry)).toBe("M0,160L0,20");
    expect(predictedProgress(sameDay, 8, "2026-09-30")).toBe(0);
    expect(predictedProgress(sameDay, 8, "2026-10-01")).toBe(8);
    expect(predictedProgress(sameDay, 8, "2026-10-02")).toBe(8);
  });

  it("uses calendar-day pace across daylight saving changes", () => {
    const autumn = {
      ...release,
      startDate: "2026-10-24",
      codeFreezeDate: "2026-10-26",
    };
    expect(predictedProgress(autumn, 10, "2026-10-25")).toBe(5);
  });
});
