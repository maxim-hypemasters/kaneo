import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFeatureDocument } from "@/fetchers/feature/feature-workspace";
import { featureWorkspaceKey } from "@/hooks/queries/feature/use-feature-workspace";

// Creates an empty document so it can open straight away, already saved.
export function useCreateFeatureDocument(projectId: string, featureId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) =>
      createFeatureDocument(featureId, { title, body: "" }),
    onSuccess: (document) => {
      const key = featureWorkspaceKey(projectId, featureId);
      queryClient.setQueryData([...key, "document", document.id], document);
      void queryClient.invalidateQueries({ queryKey: [...key, "documents"] });
    },
  });
}
