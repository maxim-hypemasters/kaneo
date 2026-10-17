import { format, parseISO } from "date-fns";
import { describe, expect, it } from "vite-plus/test";
import type { GanttFeatureLane, ScheduledTask } from "./gantt-types";
import {
  groupGanttTasksByFeature,
  laneKeyForFeature,
  NO_FEATURE_LANE_KEY,
} from "./group-gantt-tasks-by-feature";

function task(
  id: string,
  start: string,
  end: string,
  hierarchy: Pick<ScheduledTask, "type" | "featureId"> = {},
): ScheduledTask {
  return {
    id,
    title: id,
    number: 1,
    description: null,
    status: "to-do",
    priority: null,
    startDate: start,
    dueDate: end,
    position: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    userId: null,
    assigneeId: null,
    assigneeName: null,
    projectId: "project",
    scheduleStart: parseISO(start),
    scheduleEnd: parseISO(end),
    ...hierarchy,
  };
}

const feature = (id: string, start = "2026-09-01", end = "2026-09-02") =>
  task(id, start, end, { type: "feature" });
const inFeature = (id: string, featureId: string, start: string, end: string) =>
  task(id, start, end, { featureId });

const boardFeatures = new Map(
  ["checkout", "search", "billing", "Alpha 10", "Alpha 9"].map((id) => [
    id,
    { title: id === "checkout" ? "Checkout" : id },
  ]),
);
const options = {
  listedFeatureIds: [] as string[],
  features: boardFeatures,
  noFeatureLabel: "No feature",
  unknownFeatureLabel: "Unknown feature",
};

const keys = (lanes: GanttFeatureLane[]) => lanes.map((lane) => lane.key);
const laneOf = (lanes: GanttFeatureLane[], key: string) => {
  const lane = lanes.find((candidate) => candidate.key === key);
  if (!lane) throw new Error(`no lane ${key}`);
  return lane;
};
const day = (date: Date | null) => (date ? format(date, "yyyy-MM-dd") : null);

describe("groupGanttTasksByFeature", () => {
  it("puts each task in its feature's lane, in input order, with No feature last", () => {
    const lanes = groupGanttTasksByFeature(
      [
        task("loose", "2026-09-01", "2026-09-02"),
        inFeature("cart", "checkout", "2026-09-02", "2026-09-04"),
        inFeature("query", "search", "2026-09-03", "2026-09-05"),
        inFeature("pay", "checkout", "2026-09-06", "2026-09-08"),
      ],
      options,
    );

    expect(keys(lanes)).toEqual([
      "feature:checkout",
      "feature:search",
      NO_FEATURE_LANE_KEY,
    ]);
    expect(
      laneOf(lanes, "feature:checkout").tasks.map((item) => item.id),
    ).toEqual(["cart", "pay"]);
    const noFeature = laneOf(lanes, NO_FEATURE_LANE_KEY);
    expect(noFeature).toMatchObject({
      featureId: null,
      name: "No feature",
      droppable: true,
      feature: null,
    });
    expect(noFeature.tasks.map((item) => item.id)).toEqual(["loose"]);
  });

  it("draws a feature in its lane header, never as one of its rows", () => {
    const checkout = feature("checkout", "2026-09-01", "2026-09-20");
    const lanes = groupGanttTasksByFeature(
      [checkout, inFeature("cart", "checkout", "2026-09-02", "2026-09-04")],
      options,
    );

    const lane = laneOf(lanes, "feature:checkout");
    expect(lane.feature).toBe(checkout);
    expect(lane.tasks.map((item) => item.id)).toEqual(["cart"]);
    expect(lane).toMatchObject({ name: "Checkout", droppable: true });
  });

  it("spans the lane's tasks, not the feature's own dates", () => {
    const lanes = groupGanttTasksByFeature(
      [
        feature("checkout", "2026-08-01", "2026-12-31"),
        inFeature("cart", "checkout", "2026-09-02", "2026-09-04"),
        inFeature("pay", "checkout", "2026-09-01", "2026-09-03"),
        inFeature("tax", "checkout", "2026-09-05", "2026-09-09"),
      ],
      options,
    );

    const lane = laneOf(lanes, "feature:checkout");
    expect(day(lane.start)).toBe("2026-09-01");
    expect(day(lane.end)).toBe("2026-09-09");
  });

  it("leaves the span empty for a lane with only its feature's bar", () => {
    const lanes = groupGanttTasksByFeature([feature("checkout")], options);

    expect(laneOf(lanes, "feature:checkout")).toMatchObject({
      tasks: [],
      start: null,
      end: null,
    });
    expect(laneOf(lanes, NO_FEATURE_LANE_KEY).start).toBeNull();
  });

  it("orders lanes by their first item, whether the feature or a task", () => {
    const lanes = groupGanttTasksByFeature(
      [
        inFeature("query", "search", "2026-09-01", "2026-09-02"),
        task("loose", "2026-09-02", "2026-09-03"),
        feature("checkout", "2026-09-03", "2026-09-09"),
        inFeature("invoice", "billing", "2026-09-04", "2026-09-05"),
        inFeature("cart", "checkout", "2026-09-05", "2026-09-06"),
        feature("search", "2026-09-06", "2026-09-07"),
      ],
      options,
    );

    expect(keys(lanes)).toEqual([
      "feature:search",
      "feature:checkout",
      "feature:billing",
      NO_FEATURE_LANE_KEY,
    ]);
  });

  it("gives listed features with nothing on the chart a lane, alphabetically after the rest", () => {
    const lanes = groupGanttTasksByFeature(
      [inFeature("query", "search", "2026-09-01", "2026-09-02")],
      {
        ...options,
        listedFeatureIds: ["checkout", "Alpha 10", "search", "Alpha 9"],
      },
    );

    expect(keys(lanes)).toEqual([
      "feature:search",
      "feature:Alpha 9",
      "feature:Alpha 10",
      "feature:checkout",
      NO_FEATURE_LANE_KEY,
    ]);
    expect(laneOf(lanes, "feature:checkout")).toMatchObject({
      feature: null,
      tasks: [],
      droppable: true,
    });
  });

  it("always shows the No feature lane, even with nothing in it", () => {
    expect(keys(groupGanttTasksByFeature([], options))).toEqual([
      NO_FEATURE_LANE_KEY,
    ]);
  });

  it("keeps a lane for a filtered-out feature's tasks, titled from the board", () => {
    // The feature itself isn't among the tasks: it's filtered out.
    const lanes = groupGanttTasksByFeature(
      [inFeature("cart", "checkout", "2026-09-02", "2026-09-04")],
      options,
    );

    expect(laneOf(lanes, "feature:checkout")).toMatchObject({
      name: "Checkout",
      feature: null,
      droppable: true,
    });
  });

  it("names a feature that isn't on the board unknown, and refuses drops on it", () => {
    const lanes = groupGanttTasksByFeature(
      [inFeature("orphan", "gone", "2026-09-02", "2026-09-04")],
      options,
    );

    expect(laneOf(lanes, "feature:gone")).toMatchObject({
      featureId: "gone",
      name: "Unknown feature",
      droppable: false,
    });
  });

  it("keys features apart from the No feature lane", () => {
    expect(laneKeyForFeature(null)).toBe(NO_FEATURE_LANE_KEY);
    expect(laneKeyForFeature(undefined)).toBe(NO_FEATURE_LANE_KEY);
    expect(laneKeyForFeature(NO_FEATURE_LANE_KEY)).toBe("feature:no-feature");
  });
});
