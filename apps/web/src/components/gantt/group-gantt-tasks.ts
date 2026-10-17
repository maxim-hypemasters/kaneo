import type { GanttFeatureSpan, GanttLane, ScheduledTask } from "./gantt-types";
import { groupedRowTasks } from "./grouped-row-tasks";
import { packFeatureTracks } from "./pack-feature-tracks";

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
  // Every feature on the unfiltered board (planned and archived ones too),
  // so a slice is titled even when the feature itself is filtered out.
  features: ReadonlyMap<string, { title: string }>;
  unknownFeatureLabel: string;
  // Features that keep their own row even with tasks on the chart (see
  // groupedRowTasks).
  featureRowIds?: ReadonlySet<string>;
};

type FeatureExtent = { start: Date; end: Date; taskCount: number };

const collator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

// One lane per assignee of the given (already filtered and date-sorted)
// tasks, plus empty lanes for project members and "Unassigned" that pass the
// assignee filter. Lanes are alphabetical with Unassigned last, so they keep
// their place while tasks are rescheduled or dragged between them.
// Features leave the rows (see groupedRowTasks) and show in each lane header
// instead, spanning that member's tasks in them.
export function groupGanttTasks(
  tasks: readonly ScheduledTask[],
  options: GroupGanttTasksOptions,
): GanttLane[] {
  const membersById = new Map(
    options.members.map((member) => [member.id, member]),
  );
  const lanes = new Map<string, GanttLane>();
  const extentsByLane = new Map<string, Map<string, FeatureExtent>>();

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
      features: [],
      overflowFeatures: [],
      featureTrackCount: 0,
    };
    lanes.set(key, lane);
    return lane;
  };

  for (const task of groupedRowTasks(tasks, options.featureRowIds)) {
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
    if (task.featureId && task.type !== "feature") {
      const extents =
        extentsByLane.get(lane.key) ?? new Map<string, FeatureExtent>();
      extentsByLane.set(lane.key, extents);
      const extent = extents.get(task.featureId);
      extents.set(task.featureId, {
        start:
          extent && extent.start < task.scheduleStart
            ? extent.start
            : task.scheduleStart,
        end:
          extent && extent.end > task.scheduleEnd
            ? extent.end
            : task.scheduleEnd,
        taskCount: (extent?.taskCount ?? 0) + 1,
      });
    }
  }

  for (const [laneKey, extents] of extentsByLane) {
    const lane = lanes.get(laneKey);
    if (!lane) continue;
    const spans: GanttFeatureSpan[] = [...extents].map(
      ([featureId, extent]) => ({
        featureId,
        title:
          options.features.get(featureId)?.title.trim() ||
          options.unknownFeatureLabel,
        ...extent,
      }),
    );
    const packed = packFeatureTracks(spans);
    lane.features = packed.placed;
    lane.overflowFeatures = packed.overflow;
    lane.featureTrackCount = packed.trackCount;
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
