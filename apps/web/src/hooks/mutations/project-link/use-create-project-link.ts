import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createProjectLink } from "@/fetchers/project-link/create-project-link";
import { projectLinksKey } from "@/hooks/queries/project-link/project-links-key";

export function useCreateProjectLink(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (link: { url: string; title: string }) =>
      createProjectLink(projectId, link),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: projectLinksKey(projectId) }),
  });
}
