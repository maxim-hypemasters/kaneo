import { describe, expect, it } from "vite-plus/test";
import {
  buildDemoPlan,
  shiftDay,
} from "../../../apps/api/scripts/release-progress-demo-plan";

describe("release progress demo plan", () => {
  it("creates stable, clearly labelled past, active and upcoming samples", () => {
    const plan = buildDemoPlan("project-1", "2026-10-18");
    expect(
      plan.map(({ name, startDate, codeFreezeDate, submissionDate }) => ({
        name,
        startDate,
        codeFreezeDate,
        submissionDate,
      })),
    ).toEqual([
      {
        name: "Demo · 0.68",
        startDate: "2026-09-20",
        codeFreezeDate: "2026-10-04",
        submissionDate: "2026-10-08",
      },
      {
        name: "Demo · 0.70",
        startDate: "2026-10-08",
        codeFreezeDate: "2026-10-24",
        submissionDate: "2026-10-28",
      },
      {
        name: "Demo · 0.71",
        startDate: "2026-11-01",
        codeFreezeDate: "2026-11-15",
        submissionDate: "2026-11-19",
      },
    ]);
    const items = plan.flatMap((release) => release.items);
    expect(items.filter((item) => item.type === "feature")).toHaveLength(6);
    expect(items.filter((item) => item.type === "task")).toHaveLength(30);
    expect(new Set(items.map((item) => item.id)).size).toBe(36);
    expect(plan.map((release) => release.id)).toEqual(
      buildDemoPlan("project-1", "2026-10-19").map((release) => release.id),
    );
  });

  it("ends every simulated task history in its actual status without future events", () => {
    for (const release of buildDemoPlan("project-1", "2026-10-18")) {
      for (const item of release.items.filter((row) => row.type === "task")) {
        expect(item.stages.at(-1)?.status).toBe(item.status);
        expect(
          item.stages.every(
            (stage) =>
              stage.date >= release.trackingDay && stage.date < "2026-10-18",
          ),
        ).toBe(true);
        expect(item.stages.map((stage) => stage.date)).toEqual(
          item.stages.map((stage) => stage.date).sort(),
        );
      }
    }
  });

  it("validates calendar dates rather than accepting rolled-over days", () => {
    expect(() => shiftDay("2026-02-30", 0)).toThrow("calendar day");
    expect(() => shiftDay("2026-2-3", 0)).toThrow("calendar day");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
  });
});
