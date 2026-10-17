import { useMutation, useQueryClient } from "@tanstack/react-query";
import createTaskRelation from "@/fetchers/task-relation/create-task-relation";

import { invalidateRelationTaskProject } from "./invalidate-relation-task-project";

type Variables = {
  sourceTaskId: string;
  targetTaskId: string;
  // Feature membership has its own route: useUpdateTaskFeature.
  relationType: "blocks" | "related";
};

function useCreateTaskRelation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Variables) => createTaskRelation(variables),
    onSuccess: (_, variables) => {
      void invalidateRelationTaskProject(queryClient, variables.sourceTaskId);
      queryClient.invalidateQueries({
        queryKey: ["task-relations", variables.sourceTaskId],
      });
      queryClient.invalidateQueries({
        queryKey: ["task-relations", variables.targetTaskId],
      });
      queryClient.invalidateQueries({ queryKey: ["project-task-relations"] });
    },
  });
}

export default useCreateTaskRelation;
