import { useMutation, useQueryClient } from "@tanstack/react-query";
import { featureWorkspaceKey } from "@/hooks/queries/feature/use-feature-workspace";

export function useFeatureWorkspaceMutation<TInput, TOutput>(
  projectId: string,
  featureId: string,
  mutationFn: (input: TInput) => Promise<TOutput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: featureWorkspaceKey(projectId, featureId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["activities", featureId],
      });
      void queryClient.invalidateQueries({ queryKey: ["workspace-activity"] });
      void queryClient.invalidateQueries({ queryKey: ["task", featureId] });
    },
  });
}
