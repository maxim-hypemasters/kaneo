import type {
  GanttMilestoneLane,
  GanttMilestoneRecord,
  ScheduledTask,
} from "./gantt-types";

export const NO_MILESTONE_LANE_KEY = "no-milestone";
export const laneKeyForMilestone = (id: string | null | undefined) =>
  id ? `milestone:${id}` : NO_MILESTONE_LANE_KEY;

export function groupGanttTasksByMilestone(
  tasks: readonly ScheduledTask[],
  milestones: readonly GanttMilestoneRecord[],
  noMilestoneLabel: string,
  unknownLabel: string,
): GanttMilestoneLane[] {
  const definitions = new Map(
    milestones.map((milestone) => [milestone.id, milestone]),
  );
  const lanes = new Map<string, GanttMilestoneLane>();
  const laneFor = (id: string | null) => {
    const key = laneKeyForMilestone(id);
    const existing = lanes.get(key);
    if (existing) return existing;
    const definition = id ? definitions.get(id) : null;
    const lane: GanttMilestoneLane = {
      key,
      milestoneId: id,
      featureId: definition?.featureId ?? null,
      name: definition
        ? `${definition.featureTitle} · ${definition.title}`
        : id
          ? unknownLabel
          : noMilestoneLabel,
      milestone: null,
      tasks: [],
      start: null,
      end: null,
      droppable: id === null || definition !== undefined,
    };
    lanes.set(key, lane);
    return lane;
  };
  // Include undated and empty milestones in manual Feature order.
  for (const milestone of [...milestones].sort(
    (a, b) =>
      a.featureTitle.localeCompare(b.featureTitle) ||
      a.featureId.localeCompare(b.featureId) ||
      a.position - b.position ||
      a.id.localeCompare(b.id),
  )) {
    laneFor(milestone.id);
  }
  for (const task of tasks) {
    if (task.entityKind === "milestone") {
      laneFor(task.milestone.id).milestone = task;
    } else {
      const lane = laneFor(task.milestoneId ?? null);
      lane.tasks.push(task);
      if (!lane.start || task.scheduleStart < lane.start)
        lane.start = task.scheduleStart;
      if (!lane.end || task.scheduleEnd > lane.end) lane.end = task.scheduleEnd;
    }
  }
  const unassigned = laneFor(null);
  return [...lanes.values()]
    .filter((lane) => lane !== unassigned)
    .concat(unassigned);
}

export function canDropIntoMilestone(
  task: ScheduledTask,
  target: {
    milestoneId: string | null;
    featureId: string | null;
    droppable: boolean;
  },
) {
  return (
    task.entityKind !== "milestone" &&
    target.droppable &&
    (target.milestoneId === null ||
      (task.featureId != null && task.featureId === target.featureId))
  );
}
