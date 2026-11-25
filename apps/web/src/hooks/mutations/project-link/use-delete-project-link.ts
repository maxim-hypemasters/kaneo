import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteProjectLink } from "@/fetchers/project-link/delete-project-link";
import { projectLinksKey } from "@/hooks/queries/project-link/project-links-key";

export function useDeleteProjectLink(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProjectLink(projectId, id),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: projectLinksKey(projectId) }),
  });
}
