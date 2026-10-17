import type Task from "@/types/task";

export type ScheduledTask = Task & {
  scheduleStart: Date;
  scheduleEnd: Date;
};

// What a finished drag on a bar asks the route to save. `userId` is the
// assignee the task should end up with (null = unassigned), and `featureId`
// the feature it should end up in (null = none).
export type GanttTaskEdit = {
  start: Date;
  end: Date;
  userId: string | null;
  featureId: string | null;
};

// A feature on one member's line: from the earliest start to the latest end
// of that member's tasks in it.
export type GanttFeatureSpan = {
  featureId: string;
  title: string;
  start: Date;
  end: Date;
  taskCount: number;
};

export type GanttLaneFeature = GanttFeatureSpan & {
  // 0-based row in the lane header; overlapping features stack.
  track: number;
};

export type GanttLane = {
  key: string;
  userId: string | null;
  name: string;
  image: string | null;
  tasks: ScheduledTask[];
  // Earliest start and latest end of the lane's tasks; null for empty lanes.
  start: Date | null;
  end: Date | null;
  // False for assignees who no longer have access to the project: the API
  // would reject a reassignment to them.
  droppable: boolean;
  features: GanttLaneFeature[];
  // Features that found no free track, in start order.
  overflowFeatures: GanttFeatureSpan[];
  featureTrackCount: number;
};

// A lane of the chart grouped by feature: one feature, or "No feature", with
// its tasks on the chart.
export type GanttFeatureLane = {
  key: string;
  // null for the "No feature" lane.
  featureId: string | null;
  name: string;
  // The feature's own bar, drawn in the lane header; null when the feature
  // is filtered out or undated, and for "No feature".
  feature: ScheduledTask | null;
  tasks: ScheduledTask[];
  // Earliest start and latest end of the lane's tasks (not the feature's
  // own dates); null for empty lanes.
  start: Date | null;
  end: Date | null;
  // False for a feature that isn't on the board: the API would refuse to
  // move a task into it.
  droppable: boolean;
};

// A lane a bar can be dropped on: dropping on an assignee lane reassigns the
// task, dropping on a feature lane moves it into that feature (or, for the
// "No feature" lane, out of its feature).
export type GanttLaneTarget =
  | {
      kind: "assignee";
      key: string;
      userId: string | null;
      name: string;
      droppable: boolean;
    }
  | {
      kind: "feature";
      key: string;
      featureId: string | null;
      name: string;
      droppable: boolean;
    };

export type GanttLaneDragState = {
  taskId: string;
  targetLaneKey: string | null;
};

// Passed to a bar only when it may be dragged into another lane: grouped by
// assignee and allowed to assign tasks, or grouped by feature and allowed to
// update tasks.
export type GanttLaneDrag = {
  // What the lanes stand for, and so what a drop on another lane changes.
  kind: GanttLaneTarget["kind"];
  laneKey: string;
  resolveLane: (laneKey: string) => GanttLaneTarget | null;
  onChange: (state: GanttLaneDragState | null) => void;
};
