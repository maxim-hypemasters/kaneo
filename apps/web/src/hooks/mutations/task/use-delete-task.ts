import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getFeatureIndex } from "@/lib/features/feature-index";
import { invalidateFeatureChange } from "@/lib/invalidate-feature-change";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import deleteTask from "@/fetchers/task/delete-task";
import useProjectStore from "@/store/project";
import type { ProjectWithTasks } from "@/types/project";
import { removeTaskFromProject } from "./remove-task-from-project";

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTask,
    onSuccess: (
      deletedTask: Omit<
        Awaited<ReturnType<typeof deleteTask>>,
        "archivedAt"
      > & { archivedAt?: string | null },
    ) => {
      invalidateMyWork(queryClient);
      void queryClient.invalidateQueries({
        queryKey: ["feature-library", deletedTask.projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["project-features", deletedTask.projectId],
      });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      const boardKey = ["tasks", deletedTask.projectId];
      // The task's feature lost a task; a deleted feature's tasks left it.
      const featureTasks =
        deletedTask.type === "feature"
          ? (getFeatureIndex(
              queryClient.getQueryData<ProjectWithTasks>(boardKey),
            ).tasksByFeature.get(deletedTask.id) ?? [])
          : [];
      const changed = [
        deletedTask.featureId,
        ...featureTasks.map((task) => task.id),
      ].filter((id): id is string => !!id);
      queryClient.setQueryData<ProjectWithTasks | undefined>(
        boardKey,
        (project) =>
          project ? removeTaskFromProject(project, deletedTask.id) : project,
      );
      queryClient.removeQueries({
        queryKey: ["task", deletedTask.id],
        exact: true,
      });
      // Both refresh the board.
      if (changed.length)
        invalidateFeatureChange(queryClient, deletedTask.projectId, changed);
      else {
        void queryClient.invalidateQueries({
          queryKey: ["releases", deletedTask.projectId],
        });
        void queryClient.invalidateQueries({ queryKey: boardKey });
        void queryClient.invalidateQueries({
          queryKey: ["release-progress", deletedTask.projectId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["feature-milestones", deletedTask.projectId],
        });
      }

      const { project, setProject } = useProjectStore.getState();
      if (project?.id === deletedTask.projectId) {
        setProject(removeTaskFromProject(project, deletedTask.id));
      }
    },
  });
}
