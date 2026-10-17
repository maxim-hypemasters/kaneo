import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import { useFeatureIndex } from "@/hooks/queries/task/use-feature-index";
import useGetTaskRelations from "@/hooks/queries/task-relation/use-get-task-relations";
import { listFeatureTasks } from "./feature-lookup";

// A feature's tasks, from the cached board when it holds the feature, else
// from the feature's relations. `ready` once either has answered.
export function useFeatureTasks(featureId: string, projectId: string) {
  const index = useFeatureIndex(projectId);
  const { data: relations = [], isSuccess } = useGetTaskRelations(featureId);
  const { data: columns = [] } = useGetColumns(projectId);
  const finalStatuses = new Set(
    columns.filter((column) => column.isFinal).map((column) => column.slug),
  );
  return {
    tasks: listFeatureTasks({ featureId, index, relations, finalStatuses }),
    ready: index.features.has(featureId) || isSuccess,
  };
}
