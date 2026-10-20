import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import { useFeatureIndex } from "@/hooks/queries/task/use-feature-index";
import useGetTaskRelations from "@/hooks/queries/task-relation/use-get-task-relations";
import { listFeatureTasks } from "./feature-lookup";

// Relations contain the complete membership even when the execution board
// has not loaded or is still paginating.
export function useFeatureTasks(featureId: string, projectId: string) {
  const index = useFeatureIndex(projectId);
  const {
    data: relations = [],
    isSuccess,
    isError,
    refetch,
  } = useGetTaskRelations(featureId);
  const { data: columns = [] } = useGetColumns(projectId);
  const finalStatuses = new Set(
    columns.filter((column) => column.isFinal).map((column) => column.slug),
  );
  return {
    tasks: listFeatureTasks({
      featureId,
      index: { ...index, features: new Map() },
      relations,
      finalStatuses,
    }),
    ready: isSuccess,
    isError,
    refetch,
  };
}
