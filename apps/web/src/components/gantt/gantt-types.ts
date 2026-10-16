import type Task from "@/types/task";

export type ScheduledTask = Task & {
  scheduleStart: Date;
  scheduleEnd: Date;
};

// What a finished drag on a bar asks the route to save. `userId` is the
// assignee the task should end up with (null = unassigned).
export type GanttTaskEdit = {
  start: Date;
  end: Date;
  userId: string | null;
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

export type GanttLaneTarget = Pick<
  GanttLane,
  "key" | "userId" | "name" | "droppable"
>;

export type GanttLaneDragState = {
  taskId: string;
  targetLaneKey: string | null;
};

// Passed to a bar only when it may be dragged into another lane (grouped by
// assignee and allowed to assign tasks).
export type GanttLaneDrag = {
  laneKey: string;
  resolveLane: (laneKey: string) => GanttLaneTarget | null;
  onChange: (state: GanttLaneDragState | null) => void;
};
