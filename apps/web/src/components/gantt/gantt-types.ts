import type Task from "@/types/task";

export type GanttMilestoneRecord = {
  id: string;
  featureId: string;
  featureTitle: string;
  projectId: string;
  title: string;
  leadId: string | null;
  status: string;
  columnId?: string | null;
  priority: string | null;
  releaseId: string | null;
  startDate?: string | null;
  endDate?: string | null;
  position: number;
  progress: { total: number; started: number; completed: number };
};

type ScheduleDates = { scheduleStart: Date; scheduleEnd: Date };
export type ScheduledLeaf = Omit<Task, "status" | "type"> &
  ScheduleDates & {
    status: string;
    type?: "task" | "bug";
    entityKind?: "task";
    milestone?: never;
  };
export type ScheduledMilestone = Omit<Task, "type" | "status"> &
  ScheduleDates & {
    status: string;
    entityKind: "milestone";
    type: "milestone";
    milestone: GanttMilestoneRecord;
  };
export type ScheduledTask = ScheduledLeaf | ScheduledMilestone;

// What a finished drag on a bar asks the route to save. `userId` is the
// task assignee or milestone lead (null = unassigned). Feature context is
// preserved; a task drop may only change its milestone membership.
export type GanttTaskEdit = {
  start: Date;
  end: Date;
  userId: string | null;
  featureId: string | null;
  milestoneId?: string | null;
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
};

// A lane a bar can be dropped on: dropping on an assignee lane reassigns the
// item. A milestone lane can assign same-Feature leaf work or clear it.
export type GanttLaneTarget =
  | {
      kind: "assignee";
      key: string;
      userId: string | null;
      name: string;
      droppable: boolean;
    }
  | {
      kind: "milestone";
      key: string;
      milestoneId: string | null;
      featureId: string | null;
      name: string;
      droppable: boolean;
    };

export type GanttLaneDragState = {
  taskId: string;
  targetLaneKey: string | null;
};

// Passed to a bar only when it may be dragged into another lane: grouped by
// assignee and allowed to assign tasks, or grouped by milestone and allowed to
// update tasks.
export type GanttLaneDrag = {
  // What the lanes stand for, and so what a drop on another lane changes.
  kind: GanttLaneTarget["kind"];
  laneKey: string;
  resolveLane: (laneKey: string) => GanttLaneTarget | null;
  onChange: (state: GanttLaneDragState | null) => void;
};

export type GanttMilestoneLane = {
  key: string;
  milestoneId: string | null;
  featureId: string | null;
  name: string;
  milestone: ScheduledMilestone | null;
  tasks: ScheduledLeaf[];
  start: Date | null;
  end: Date | null;
  droppable: boolean;
};
