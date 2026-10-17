import { useFeatureIndex } from "@/hooks/queries/task/use-feature-index";
import useGetTaskRelations from "@/hooks/queries/task-relation/use-get-task-relations";
import type Task from "@/types/task";
import { findTaskFeature } from "./feature-lookup";

// The feature the task belongs to (null for none, undefined while unknown).
// Reads the cached board first; the task's relations cover the full-page
// view opened without one.
export function useTaskFeature(
  task: Pick<Task, "id" | "projectId" | "featureId"> | undefined,
) {
  const index = useFeatureIndex(task?.projectId);
  const { data: relations = [], isSuccess } = useGetTaskRelations(
    task?.id ?? "",
  );
  if (!task) return undefined;
  return findTaskFeature({
    taskId: task.id,
    featureId: task.featureId,
    projectId: task.projectId,
    index,
    relations,
    relationsLoaded: isSuccess,
  });
}
