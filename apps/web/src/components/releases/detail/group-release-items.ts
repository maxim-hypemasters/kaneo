import type { FeatureIndex } from "@/lib/features/feature-index";
import { getReleaseIndex } from "@/lib/releases/release-index";
import type Task from "@/types/task";

type Board = Parameters<typeof getReleaseIndex>[0];

export type ReleaseFeatureGroup = {
  feature: Task;
  // False when only some of its tasks are in the release.
  inRelease: boolean;
  // Its tasks in this release, unfinished first.
  tasks: Task[];
  // Its other tasks, in another release or none; archived ones left out.
  tasksElsewhere: number;
};

export type ReleaseItemGroups = {
  features: ReleaseFeatureGroup[];
  // Tasks in this release that belong to no feature.
  standalone: Task[];
};

function unfinishedFirst(tasks: Task[], done: ReadonlySet<string>) {
  return [
    ...tasks.filter((task) => !done.has(task.status)),
    ...tasks.filter((task) => done.has(task.status)),
  ];
}

// A release's page, from the board: a group for each feature that is in the
// release or has tasks in it, then the tasks without a feature. Groups keep
// board order, with features in the release first and finished ones last.
// Archived items are left out.
export function groupReleaseItems(
  board: Board,
  releaseId: string,
  featureIndex: FeatureIndex,
  done: ReadonlySet<string>,
): ReleaseItemGroups {
  const groups = new Map<string, ReleaseFeatureGroup>();
  const standalone: Task[] = [];
  const groupFor = (feature: Task) => {
    let group = groups.get(feature.id);
    if (!group) {
      group = {
        feature,
        inRelease: feature.releaseId === releaseId,
        tasks: [],
        tasksElsewhere: 0,
      };
      groups.set(feature.id, group);
    }
    return group;
  };

  for (const item of getReleaseIndex(board).get(releaseId) ?? []) {
    if (item.type === "feature") {
      groupFor(item);
      continue;
    }
    const feature = item.featureId
      ? featureIndex.features.get(item.featureId)
      : undefined;
    if (feature) groupFor(feature).tasks.push(item);
    else standalone.push(item);
  }

  const rank = (group: ReleaseFeatureGroup) =>
    (done.has(group.feature.status) ? 2 : 0) + (group.inRelease ? 0 : 1);
  const features = [...groups.values()]
    .map((group) => ({
      ...group,
      tasks: unfinishedFirst(group.tasks, done),
      tasksElsewhere: (
        featureIndex.tasksByFeature.get(group.feature.id) ?? []
      ).filter(
        (task) => task.releaseId !== releaseId && task.status !== "archived",
      ).length,
    }))
    .sort((left, right) => rank(left) - rank(right));

  return { features, standalone: unfinishedFirst(standalone, done) };
}
