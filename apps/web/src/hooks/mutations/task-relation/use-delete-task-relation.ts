import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteTaskRelation from "@/fetchers/task-relation/delete-task-relation";

import { invalidateRelationTaskProject } from "./invalidate-relation-task-project";

function useDeleteTaskRelation(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTaskRelation,
    onSuccess: (relation) => {
      void invalidateRelationTaskProject(queryClient, relation.sourceTaskId);
      // Both ends list the relation.
      for (const id of new Set([
        taskId,
        relation.sourceTaskId,
        relation.targetTaskId,
      ])) {
        queryClient.invalidateQueries({ queryKey: ["task-relations", id] });
      }
      queryClient.invalidateQueries({ queryKey: ["project-task-relations"] });
    },
  });
}

export default useDeleteTaskRelation;
