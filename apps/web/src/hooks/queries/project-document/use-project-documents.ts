import { useQuery } from "@tanstack/react-query";
import { getProjectDocuments } from "@/fetchers/project-document/get-project-documents";
import { projectDocumentsKey } from "./project-document-keys";

export function useProjectDocuments(projectId: string) {
  return useQuery({
    queryKey: projectDocumentsKey(projectId),
    queryFn: () => getProjectDocuments(projectId),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });
}
