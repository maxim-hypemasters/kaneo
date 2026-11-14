import { useQuery } from "@tanstack/react-query";
import { getProjectDocument } from "@/fetchers/project-document/get-project-document";
import { projectDocumentKey } from "./project-document-keys";

export function useProjectDocument(projectId: string, documentId?: string) {
  return useQuery({
    queryKey: projectDocumentKey(projectId, documentId ?? ""),
    queryFn: () => getProjectDocument(documentId ?? ""),
    enabled: Boolean(projectId && documentId),
    staleTime: 30_000,
  });
}
