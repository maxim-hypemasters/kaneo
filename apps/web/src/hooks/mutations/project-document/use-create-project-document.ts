import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createProjectDocument } from "@/fetchers/project-document/create-project-document";
import {
  projectDocumentKey,
  projectDocumentsKey,
} from "@/hooks/queries/project-document/project-document-keys";

// Creates an empty page so it can open straight away, already saved.
export function useCreateProjectDocument(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; parentId: string | null }) =>
      createProjectDocument(projectId, input),
    onSuccess: (document) => {
      queryClient.setQueryData(
        projectDocumentKey(projectId, document.id),
        document,
      );
      void queryClient.invalidateQueries({
        queryKey: projectDocumentsKey(projectId),
        exact: true,
      });
    },
  });
}
