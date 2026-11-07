import { describe, expect, it } from "vite-plus/test";
import {
  featureUpdateData,
  milestoneSnapshotPercent,
} from "./feature-update-data";

describe("Feature update snapshots", () => {
  it("keeps immutable names and previous/current whole-milestone totals", () => {
    const milestone = {
      id: "deleted",
      title: "Original milestone name",
      position: 0,
      total: 5,
      started: 4,
      completed: 3,
      previousTotal: 4,
      previousCompleted: 1,
    };
    expect(
      featureUpdateData({ health: "at-risk", milestones: [milestone] }),
    ).toEqual({ health: "at-risk", milestones: [milestone] });
    expect(milestoneSnapshotPercent(3, 5)).toBe(60);
  });
  it("supports a first report and empty milestones without fabricating growth", () => {
    expect(
      featureUpdateData({
        health: "on-track",
        milestones: [
          {
            id: "a",
            title: "Empty",
            position: 0,
            total: 0,
            started: 0,
            completed: 0,
            previousTotal: null,
            previousCompleted: null,
          },
        ],
      })?.milestones[0].previousTotal,
    ).toBeNull();
    expect(milestoneSnapshotPercent(0, 0)).toBe(0);
  });
  it("ignores malformed/imported payloads rather than throwing in the activity feed", () => {
    expect(featureUpdateData(null)).toBeNull();
    expect(featureUpdateData({ health: "done", milestones: [] })).toBeNull();
    expect(
      featureUpdateData({
        health: "off-track",
        milestones: [null, {}, "wrong"],
      })?.milestones,
    ).toEqual([]);
  });
});
