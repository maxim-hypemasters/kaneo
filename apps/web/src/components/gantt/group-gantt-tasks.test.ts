import { format, parseISO } from "date-fns";
import { describe, expect, it } from "vite-plus/test";
import type { GanttLane, ScheduledTask } from "./gantt-types";
import {
  assigneeLaneVisible,
  groupGanttTasks,
  laneKeyForAssignee,
  UNASSIGNED_LANE_KEY,
} from "./group-gantt-tasks";

function task(
  id: string,
  start: string,
  end: string,
  assignee: { userId: string; name?: string | null; image?: string } | null,
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
    userId: assignee?.userId ?? null,
    assigneeId: assignee?.userId ?? null,
    assigneeName: assignee?.name ?? null,
    assigneeImage: assignee?.image ?? null,
    projectId: "project",
    scheduleStart: parseISO(start),
    scheduleEnd: parseISO(end),
    ...hierarchy,
  };
}

const labels = {
  unassignedLabel: "Unassigned",
  unknownLabel: "Unknown",
  features: new Map<string, { title: string }>(),
  unknownFeatureLabel: "Unknown feature",
};
const noFilter = { values: null, negated: false };

describe("groupGanttTasks", () => {
  it("orders member lanes alphabetically (case-insensitively) with Unassigned last", () => {
    const lanes = groupGanttTasks(
      [
        task("t1", "2026-09-01", "2026-09-02", null),
        task("t2", "2026-09-01", "2026-09-02", { userId: "z", name: "Zoe" }),
        task("t3", "2026-09-01", "2026-09-02", { userId: "a", name: "alice" }),
        task("t4", "2026-09-01", "2026-09-02", { userId: "b", name: "Bob 10" }),
        task("t5", "2026-09-01", "2026-09-02", { userId: "c", name: "Bob 9" }),
      ],
      {
        ...labels,
        members: [],
        membersLoaded: false,
        assigneeFilter: noFilter,
      },
    );

    expect(lanes.map((lane) => lane.name)).toEqual([
      "alice",
      "Bob 9",
      "Bob 10",
      "Zoe",
      "Unassigned",
    ]);
    expect(lanes.at(-1)?.key).toBe(UNASSIGNED_LANE_KEY);
  });

  it("keeps people who share a name apart, in a stable order", () => {
    const lanes = groupGanttTasks(
      [
        task("t1", "2026-09-01", "2026-09-02", { userId: "u2", name: "Sam" }),
        task("t2", "2026-09-01", "2026-09-02", { userId: "u1", name: "Sam" }),
      ],
      {
        ...labels,
        members: [],
        membersLoaded: false,
        assigneeFilter: noFilter,
      },
    );

    expect(lanes.map((lane) => lane.key)).toEqual([
      "member:u1",
      "member:u2",
      UNASSIGNED_LANE_KEY,
    ]);
  });

  it("keeps task order and spans each lane from its earliest start to latest end", () => {
    const alice = { userId: "a", name: "Alice" };
    const lanes = groupGanttTasks(
      [
        task("early", "2026-09-01", "2026-09-03", alice),
        task("long", "2026-09-02", "2026-09-20", alice),
        task("late", "2026-09-10", "2026-09-12", alice),
      ],
      {
        ...labels,
        members: [],
        membersLoaded: false,
        assigneeFilter: noFilter,
      },
    );
    const [aliceLane, unassigned] = lanes;

    expect(aliceLane.tasks.map((item) => item.id)).toEqual([
      "early",
      "long",
      "late",
    ]);
    expect(aliceLane.start).toEqual(parseISO("2026-09-01"));
    expect(aliceLane.end).toEqual(parseISO("2026-09-20"));
    expect(unassigned.tasks).toEqual([]);
    expect(unassigned.start).toBeNull();
    expect(unassigned.end).toBeNull();
  });

  it("adds empty lanes for project members and prefers their live name and avatar", () => {
    const lanes = groupGanttTasks(
      [
        task("t1", "2026-09-01", "2026-09-02", {
          userId: "a",
          name: "Old name",
          image: "old.png",
        }),
      ],
      {
        ...labels,
        members: [
          { id: "a", name: "Alice", image: "alice.png" },
          { id: "b", name: "", email: "bob@example.com" },
        ],
        membersLoaded: true,
        assigneeFilter: noFilter,
      },
    );

    expect(
      lanes.map((lane) => [lane.key, lane.name, lane.image, lane.tasks.length]),
    ).toEqual([
      ["member:a", "Alice", "alice.png", 1],
      ["member:b", "bob@example.com", null, 0],
      [UNASSIGNED_LANE_KEY, "Unassigned", null, 0],
    ]);
  });

  it("marks assignees outside the project as non-droppable once members load", () => {
    const former = { userId: "gone", name: "Former" };
    const options = {
      ...labels,
      members: [{ id: "a", name: "Alice" }],
      assigneeFilter: noFilter,
    };

    const loading = groupGanttTasks(
      [task("t1", "2026-09-01", "2026-09-02", former)],
      { ...options, membersLoaded: false },
    );
    const loaded = groupGanttTasks(
      [task("t1", "2026-09-01", "2026-09-02", former)],
      { ...options, membersLoaded: true },
    );

    const formerLane = (lanes: typeof loaded) =>
      lanes.find((lane) => lane.key === "member:gone");
    expect(formerLane(loading)?.droppable).toBe(true);
    expect(formerLane(loaded)?.droppable).toBe(false);
    expect(formerLane(loaded)?.name).toBe("Former");
    expect(
      loaded.find((lane) => lane.key === UNASSIGNED_LANE_KEY)?.droppable,
    ).toBe(true);
  });

  it("falls back to the unknown label when no name is available", () => {
    const lanes = groupGanttTasks(
      [task("t1", "2026-09-01", "2026-09-02", { userId: "x", name: "  " })],
      {
        ...labels,
        members: [],
        membersLoaded: false,
        assigneeFilter: noFilter,
      },
    );

    expect(lanes[0].name).toBe("Unknown");
  });

  it("only adds empty lanes that pass the assignee filter", () => {
    const members = [
      { id: "a", name: "Alice" },
      { id: "b", name: "Bob" },
    ];
    const tasks = [
      task("t1", "2026-09-01", "2026-09-02", { userId: "a", name: "Alice" }),
    ];
    const keys = (values: string[], negated: boolean) =>
      groupGanttTasks(tasks, {
        ...labels,
        members,
        membersLoaded: true,
        assigneeFilter: { values, negated },
      }).map((lane) => lane.key);

    expect(keys(["a"], false)).toEqual(["member:a"]);
    expect(keys(["a"], true)).toEqual([
      "member:a",
      "member:b",
      UNASSIGNED_LANE_KEY,
    ]);
    expect(keys([], false)).toEqual([
      "member:a",
      "member:b",
      UNASSIGNED_LANE_KEY,
    ]);
  });

  it("returns only the always-present lanes when nothing is scheduled", () => {
    expect(
      groupGanttTasks([], {
        ...labels,
        members: [],
        membersLoaded: true,
        assigneeFilter: noFilter,
      }).map((lane) => lane.key),
    ).toEqual([UNASSIGNED_LANE_KEY]);
  });
});

describe("groupGanttTasks features", () => {
  const alice = { userId: "a", name: "Alice" };
  const bob = { userId: "b", name: "Bob" };
  const inFeature = (featureId: string) => ({
    type: "task" as const,
    featureId,
  });
  const asFeature = { type: "feature" as const, featureId: null };
  const options = {
    ...labels,
    members: [],
    membersLoaded: false,
    assigneeFilter: noFilter,
    features: new Map([
      ["checkout", { title: "Checkout" }],
      ["search", { title: "Search" }],
    ]),
  };
  const slices = (lane: GanttLane | undefined) =>
    lane?.features.map((feature) => ({
      id: feature.featureId,
      title: feature.title,
      start: format(feature.start, "yyyy-MM-dd"),
      end: format(feature.end, "yyyy-MM-dd"),
      tasks: feature.taskCount,
      track: feature.track,
    }));
  const laneOf = (lanes: GanttLane[], key: string) =>
    lanes.find((lane) => lane.key === key);

  it("spans each member's own tasks in a feature on their line", () => {
    const lanes = groupGanttTasks(
      [
        task("checkout", "2026-08-20", "2026-09-30", bob, asFeature),
        task("cart", "2026-09-01", "2026-09-04", alice, inFeature("checkout")),
        task("pay", "2026-09-08", "2026-09-12", alice, inFeature("checkout")),
        task("tax", "2026-09-03", "2026-09-05", bob, inFeature("checkout")),
        task("loose", "2026-09-20", "2026-09-22", alice),
      ],
      options,
    );

    expect(slices(laneOf(lanes, "member:a"))).toEqual([
      {
        id: "checkout",
        title: "Checkout",
        start: "2026-09-01",
        end: "2026-09-12",
        tasks: 2,
        track: 0,
      },
    ]);
    expect(slices(laneOf(lanes, "member:b"))).toEqual([
      {
        id: "checkout",
        title: "Checkout",
        start: "2026-09-03",
        end: "2026-09-05",
        tasks: 1,
        track: 0,
      },
    ]);
    // The feature leaves the rows (and Bob's count and workload bar); a task
    // without a feature only feeds the workload bar.
    expect(laneOf(lanes, "member:b")?.tasks.map((item) => item.id)).toEqual([
      "tax",
    ]);
    expect(laneOf(lanes, "member:b")?.start).toEqual(parseISO("2026-09-03"));
    expect(laneOf(lanes, "member:a")?.end).toEqual(parseISO("2026-09-22"));
    expect(laneOf(lanes, UNASSIGNED_LANE_KEY)?.featureTrackCount).toBe(0);
  });

  it("follows the tasks it's given, so filters and pending edits apply", () => {
    const lanes = groupGanttTasks(
      // "pay" was filtered out, and "cart" was dragged to new dates.
      [task("cart", "2026-09-10", "2026-09-11", alice, inFeature("checkout"))],
      options,
    );

    expect(slices(laneOf(lanes, "member:a"))).toEqual([
      {
        id: "checkout",
        title: "Checkout",
        start: "2026-09-10",
        end: "2026-09-11",
        tasks: 1,
        track: 0,
      },
    ]);
  });

  it("keeps a feature as a row when none of its tasks are on the chart", () => {
    const lanes = groupGanttTasks(
      [task("checkout", "2026-09-01", "2026-09-30", bob, asFeature)],
      options,
    );

    expect(laneOf(lanes, "member:b")?.tasks.map((item) => item.id)).toEqual([
      "checkout",
    ]);
    expect(laneOf(lanes, "member:b")?.features).toEqual([]);
  });

  it("keeps a feature it's asked to keep as a row, still drawing its slices", () => {
    const lanes = groupGanttTasks(
      [
        task("checkout", "2026-09-01", "2026-09-30", bob, asFeature),
        task("cart", "2026-09-01", "2026-09-04", alice, inFeature("checkout")),
      ],
      { ...options, featureRowIds: new Set(["checkout"]) },
    );

    expect(laneOf(lanes, "member:b")?.tasks.map((item) => item.id)).toEqual([
      "checkout",
    ]);
    expect(
      laneOf(lanes, "member:a")?.features.map((feature) => feature.featureId),
    ).toEqual(["checkout"]);
  });

  it("stacks overlapping features and overflows past three tracks", () => {
    const features = ["f1", "f2", "f3", "f4"];
    const lanes = groupGanttTasks(
      [
        ...features.map((id) =>
          task(`${id}-task`, "2026-09-01", "2026-09-05", alice, inFeature(id)),
        ),
        task("later", "2026-09-06", "2026-09-07", alice, inFeature("checkout")),
      ],
      options,
    );
    const aliceLane = laneOf(lanes, "member:a");

    expect(aliceLane?.featureTrackCount).toBe(3);
    expect(
      aliceLane?.features.map((feature) => [feature.featureId, feature.track]),
    ).toEqual([
      ["f1", 0],
      ["f2", 1],
      ["f3", 2],
      ["checkout", 0],
    ]);
    expect(
      aliceLane?.overflowFeatures.map((feature) => feature.featureId),
    ).toEqual(["f4"]);
  });

  it("titles features missing from the board with the unknown label", () => {
    const lanes = groupGanttTasks(
      [
        task("orphan", "2026-09-01", "2026-09-02", alice, inFeature("gone")),
        task("blank", "2026-09-05", "2026-09-06", alice, inFeature("blank")),
      ],
      {
        ...options,
        features: new Map([["blank", { title: "  " }]]),
      },
    );

    expect(
      laneOf(lanes, "member:a")?.features.map((feature) => feature.title),
    ).toEqual(["Unknown feature", "Unknown feature"]);
  });
});

describe("assigneeLaneVisible", () => {
  it("matches unassigned as an empty id, like the task filter does", () => {
    expect(assigneeLaneVisible(null, { values: [""], negated: false })).toBe(
      true,
    );
    expect(assigneeLaneVisible(null, { values: ["a"], negated: false })).toBe(
      false,
    );
    expect(assigneeLaneVisible(null, { values: ["a"], negated: true })).toBe(
      true,
    );
  });
});

describe("laneKeyForAssignee", () => {
  it("prefixes member ids so none can collide with the unassigned lane", () => {
    expect(laneKeyForAssignee("unassigned")).toBe("member:unassigned");
    expect(laneKeyForAssignee(null)).toBe(UNASSIGNED_LANE_KEY);
    expect(laneKeyForAssignee("")).toBe(UNASSIGNED_LANE_KEY);
  });
});
