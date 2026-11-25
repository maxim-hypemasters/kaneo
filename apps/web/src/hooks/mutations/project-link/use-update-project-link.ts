import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateProjectLink } from "@/fetchers/project-link/update-project-link";
import { projectLinksKey } from "@/hooks/queries/project-link/project-links-key";

export function useUpdateProjectLink(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...changes
    }: {
      id: string;
      url: string;
      title: string;
    }) => updateProjectLink(projectId, id, changes),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: projectLinksKey(projectId) }),
  });
}
