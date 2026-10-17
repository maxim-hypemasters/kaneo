import type { GanttFeatureLane, ScheduledTask } from "./gantt-types";

export const NO_FEATURE_LANE_KEY = "no-feature";

// Feature keys are prefixed so a task id can never collide with the "No
// feature" lane's key, or with an assignee lane's.
export function laneKeyForFeature(featureId: string | null | undefined) {
  return featureId ? `feature:${featureId}` : NO_FEATURE_LANE_KEY;
}

type GroupGanttTasksByFeatureOptions = {
  // Features that pass the view's filters, dated or not: each gets a lane
  // even with nothing on the chart, so tasks can be dragged into it.
  listedFeatureIds: Iterable<string>;
  // Every feature on the unfiltered board (planned and archived ones too),
  // so a lane is titled even when its feature is filtered out.
  features: ReadonlyMap<string, { title: string }>;
  noFeatureLabel: string;
  unknownFeatureLabel: string;
};

const collator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

// One lane per feature with its tasks among the given (already filtered and
// date-sorted) tasks, a lane for each listed feature, and "No feature" last.
// A feature's own bar sits in its lane's header, never among the rows.
// Lanes with something on the chart keep the order their first item
// appears in, so they follow the server's dates and don't jump while an
// edit is pending; the rest follow, alphabetically.
export function groupGanttTasksByFeature(
  tasks: readonly ScheduledTask[],
  options: GroupGanttTasksByFeatureOptions,
): GanttFeatureLane[] {
  const lanes = new Map<string, GanttFeatureLane>();

  const laneFor = (featureId: string | null) => {
    const key = laneKeyForFeature(featureId);
    const existing = lanes.get(key);
    if (existing) return existing;

    const lane: GanttFeatureLane = {
      key,
      featureId,
      name:
        featureId === null
          ? options.noFeatureLabel
          : options.features.get(featureId)?.title.trim() ||
            options.unknownFeatureLabel,
      feature: null,
      tasks: [],
      start: null,
      end: null,
      droppable: featureId === null || options.features.has(featureId),
    };
    lanes.set(key, lane);
    return lane;
  };

  for (const task of tasks) {
    if (task.type === "feature") {
      laneFor(task.id).feature = task;
      continue;
    }
    const lane = laneFor(task.featureId ?? null);
    lane.tasks.push(task);
    if (!lane.start || task.scheduleStart < lane.start) {
      lane.start = task.scheduleStart;
    }
    if (!lane.end || task.scheduleEnd > lane.end) {
      lane.end = task.scheduleEnd;
    }
  }

  const charted = [...lanes.values()].filter((lane) => lane.featureId !== null);
  const idle: GanttFeatureLane[] = [];
  for (const featureId of options.listedFeatureIds) {
    if (!lanes.has(laneKeyForFeature(featureId))) idle.push(laneFor(featureId));
  }
  idle.sort(
    (left, right) =>
      collator.compare(left.name, right.name) ||
      (left.key < right.key ? -1 : left.key > right.key ? 1 : 0),
  );

  return [...charted, ...idle, laneFor(null)];
}
