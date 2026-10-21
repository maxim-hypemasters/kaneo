import { useMutation, useQueryClient } from "@tanstack/react-query";
import importTasks, { type ImportDocument } from "@/fetchers/task/import-tasks";

import { invalidateMyWork } from "@/lib/invalidate-my-work";

const useImportTasks = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      document,
    }: {
      projectId: string;
      document: ImportDocument;
    }) => importTasks(projectId, document),
    onSuccess: (_, { projectId }) => {
      invalidateMyWork(queryClient);
      void queryClient.invalidateQueries({
        queryKey: ["release-progress", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["feature-milestones", projectId],
      });
      void queryClient.invalidateQueries({ queryKey: ["releases", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      void queryClient.invalidateQueries({
        queryKey: ["project-features", projectId],
      });
      void queryClient.invalidateQueries({ queryKey: ["task-relations"] });
    },
  });
};

export default useImportTasks;
