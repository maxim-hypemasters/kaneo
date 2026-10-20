import type { GanttLane, ScheduledTask } from "./gantt-types";

export const UNASSIGNED_LANE_KEY = "unassigned";

// Member keys are prefixed so a user id can never collide with the
// unassigned lane's key.
export function laneKeyForAssignee(userId: string | null | undefined) {
  return userId ? `member:${userId}` : UNASSIGNED_LANE_KEY;
}

type LaneMember = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export type AssigneeLaneFilter = {
  values: readonly string[] | null | undefined;
  negated: boolean;
};

// Same rule as the assignee check in taskMatchesFilters, applied to a lane:
// unassigned is matched as "".
export function assigneeLaneVisible(
  userId: string | null,
  filter: AssigneeLaneFilter,
) {
  if (!filter.values?.length) return true;
  const included = filter.values.includes(userId ?? "");
  return filter.negated ? !included : included;
}

type GroupGanttTasksOptions = {
  members: readonly LaneMember[];
  membersLoaded: boolean;
  assigneeFilter: AssigneeLaneFilter;
  unassignedLabel: string;
  unknownLabel: string;
};

const collator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

// One lane per assignee of the given (already filtered and date-sorted)
// tasks, plus empty lanes for project members and "Unassigned" that pass the
// assignee filter. Lanes are alphabetical with Unassigned last, so they keep
// their place while tasks are rescheduled or dragged between them.
// Milestones use their own lead and dates; linked work keeps its assignee.
export function groupGanttTasks(
  tasks: readonly ScheduledTask[],
  options: GroupGanttTasksOptions,
): GanttLane[] {
  const membersById = new Map(
    options.members.map((member) => [member.id, member]),
  );
  const lanes = new Map<string, GanttLane>();

  const laneFor = (userId: string | null) => {
    const key = laneKeyForAssignee(userId);
    const existing = lanes.get(key);
    if (existing) return existing;

    const member = userId ? membersById.get(userId) : undefined;
    const lane: GanttLane = {
      key,
      userId,
      name: userId
        ? member?.name?.trim() || member?.email?.trim() || ""
        : options.unassignedLabel,
      image: member?.image || null,
      tasks: [],
      start: null,
      end: null,
      droppable:
        userId === null || !options.membersLoaded || membersById.has(userId),
    };
    lanes.set(key, lane);
    return lane;
  };

  for (const task of tasks) {
    const lane = laneFor(task.userId || null);
    lane.tasks.push(task);
    if (!lane.name) lane.name = task.assigneeName?.trim() || "";
    if (!lane.image) lane.image = task.assigneeImage || null;
    if (!lane.start || task.scheduleStart < lane.start) {
      lane.start = task.scheduleStart;
    }
    if (!lane.end || task.scheduleEnd > lane.end) {
      lane.end = task.scheduleEnd;
    }
  }

  if (assigneeLaneVisible(null, options.assigneeFilter)) laneFor(null);
  for (const member of options.members) {
    if (assigneeLaneVisible(member.id, options.assigneeFilter)) {
      laneFor(member.id);
    }
  }

  return [...lanes.values()]
    .map((lane) => (lane.name ? lane : { ...lane, name: options.unknownLabel }))
    .sort((left, right) => {
      if (left.userId === null) return 1;
      if (right.userId === null) return -1;
      return (
        collator.compare(left.name, right.name) ||
        (left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
      );
    });
}
