import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reorderProjectLinks } from "@/fetchers/project-link/reorder-project-links";
import type { ProjectLink } from "@/fetchers/project-link/types";
import { projectLinksKey } from "@/hooks/queries/project-link/project-links-key";

export function useReorderProjectLinks(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (links: Array<{ id: string; position: number }>) =>
      reorderProjectLinks(projectId, links),
    // The saved order has to be in the cache before the drag's pending order
    // is dropped, or the row would jump back for a moment.
    onSuccess: (saved) =>
      queryClient.setQueryData<ProjectLink[]>(
        projectLinksKey(projectId),
        saved,
      ),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: projectLinksKey(projectId) }),
  });
}
