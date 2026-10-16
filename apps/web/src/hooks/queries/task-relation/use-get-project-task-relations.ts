import { useQuery } from "@tanstack/react-query";
import getProjectTaskRelations, {
  type TaskRelationType,
} from "@/fetchers/task-relation/get-project-task-relations";

function useGetProjectTaskRelations({
  projectId,
  relationType,
  enabled = true,
}: {
  projectId: string;
  relationType?: TaskRelationType;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ["project-task-relations", projectId, relationType ?? "all"],
    queryFn: () => getProjectTaskRelations(projectId, relationType),
    // Relation events that arrive while the Gantt is closed only mark this
    // query stale, and the global default skips refetching it on mount.
    refetchOnMount: true,
    enabled: enabled && !!projectId,
  });
}

export default useGetProjectTaskRelations;
