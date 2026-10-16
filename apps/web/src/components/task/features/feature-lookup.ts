import type { FeatureIndex } from "@/lib/features/feature-index";
import type Task from "@/types/task";

// One end of a relation from GET /task-relation/{taskId}.
export type RelatedTaskSummary = {
  id: string;
  title: string;
  status: string;
  isCompleted: boolean;
  priority: string | null;
  number: number | null;
  projectId: string;
  userId: string | null;
  assigneeName: string | null;
};

export type RelationWithTasks = {
  relationType: string;
  sourceTaskId: string;
  targetTaskId: string;
  sourceTask: RelatedTaskSummary | null;
  targetTask: RelatedTaskSummary | null;
};

export type FeatureSummary = {
  id: string;
  // null when the feature can't be found any more.
  title: string | null;
  number: number | null;
  projectId: string;
};

export type FeatureTaskItem = { task: Task; isCompleted: boolean };

// The relations API still lists feature membership as a "subtask" relation
// from the feature (source) to its task (target), for older clients. This UI
// reads it only when the project's board isn't cached.
export const isFeatureLink = (
  relation: Pick<RelationWithTasks, "relationType">,
) => relation.relationType === "subtask";

const summarize = ({ id, title, number, projectId }: FeatureSummary) => ({
  id,
  title,
  number,
  projectId,
});

// The feature a task belongs to: from the board when it's cached, else from
// the task's relations. undefined while that can't be told yet.
export function findTaskFeature({
  taskId,
  featureId,
  projectId,
  index,
  relations,
  relationsLoaded,
}: {
  taskId: string;
  featureId: string | null | undefined;
  projectId: string;
  index: FeatureIndex;
  relations: readonly RelationWithTasks[];
  relationsLoaded: boolean;
}): FeatureSummary | null | undefined {
  if (!featureId) return featureId === null ? null : undefined;
  const onBoard = index.features.get(featureId);
  if (onBoard) return summarize(onBoard);
  const linked = relations.find(
    (relation) =>
      isFeatureLink(relation) &&
      relation.targetTaskId === taskId &&
      relation.sourceTaskId === featureId,
  )?.sourceTask;
  if (linked) return summarize(linked);
  if (!relationsLoaded) return undefined;
  return { id: featureId, title: null, number: null, projectId };
}

export function relatedTaskToTask(
  summary: RelatedTaskSummary,
  featureId: string | null,
): Task {
  return {
    id: summary.id,
    title: summary.title,
    number: summary.number,
    description: null,
    status: summary.status,
    priority: summary.priority,
    startDate: null,
    dueDate: null,
    position: null,
    createdAt: "",
    userId: summary.userId,
    assigneeId: summary.userId,
    assigneeName: summary.assigneeName,
    projectId: summary.projectId,
    type: "task",
    featureId,
  };
}

// A feature's tasks: the board's, when it holds the feature, else the
// relations'. `finalStatuses` are the project's final column slugs.
export function listFeatureTasks({
  featureId,
  index,
  relations,
  finalStatuses,
}: {
  featureId: string;
  index: FeatureIndex;
  relations: readonly RelationWithTasks[];
  finalStatuses: ReadonlySet<string>;
}): FeatureTaskItem[] {
  if (index.features.has(featureId)) {
    return (index.tasksByFeature.get(featureId) ?? []).map((task) => ({
      task,
      isCompleted: finalStatuses.has(task.status),
    }));
  }
  return relations.flatMap((relation) =>
    isFeatureLink(relation) &&
    relation.sourceTaskId === featureId &&
    relation.targetTask
      ? [
          {
            task: relatedTaskToTask(relation.targetTask, featureId),
            isCompleted: relation.targetTask.isCompleted,
          },
        ]
      : [],
  );
}

// The features a task could join: the project's, minus the given ones.
export function pickableFeatures(
  index: FeatureIndex,
  excludeIds: ReadonlyArray<string | null | undefined>,
) {
  const excluded = new Set(excludeIds);
  return [...index.features.values()].filter(
    (feature) => !excluded.has(feature.id),
  );
}
