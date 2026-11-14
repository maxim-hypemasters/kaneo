import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteProjectDocument } from "@/fetchers/project-document/delete-project-document";
import { projectDocumentsKey } from "@/hooks/queries/project-document/project-document-keys";

export function useDeleteProjectDocument(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProjectDocument(id),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: projectDocumentsKey(projectId),
        exact: true,
      }),
  });
}
