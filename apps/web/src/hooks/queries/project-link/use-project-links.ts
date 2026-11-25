import { useQuery } from "@tanstack/react-query";
import { getProjectLinks } from "@/fetchers/project-link/get-project-links";
import { projectLinksKey } from "./project-links-key";

export function useProjectLinks(projectId: string) {
  return useQuery({
    queryKey: projectLinksKey(projectId),
    queryFn: () => getProjectLinks(projectId),
    enabled: Boolean(projectId),
  });
}
