import { useQueryClient } from "@tanstack/react-query";
import { useDocumentAutosave } from "@/components/documents/use-document-autosave";
import { pruneProjectDocumentAssets } from "@/fetchers/project-document/prune-project-document-assets";
import type { ProjectDocument } from "@/fetchers/project-document/types";
import { updateProjectDocument } from "@/fetchers/project-document/update-project-document";
import {
  projectDocumentKey,
  projectDocumentsKey,
} from "@/hooks/queries/project-document/project-document-keys";
import { uploadDraftAsset } from "@/lib/upload-draft-asset";

// Uploads are staged on the project and claimed by the save that first
// references them, like Feature documents.
export function useProjectDocumentAutosave({
  projectId,
  document,
  canEdit,
  refresh,
}: {
  projectId: string;
  document: ProjectDocument;
  canEdit: boolean;
  refresh: () => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  return useDocumentAutosave({
    document,
    canEdit,
    refresh,
    source: {
      save: (input) => updateProjectDocument(document.id, input),
      prune: (assetIds) => pruneProjectDocumentAssets(document.id, assetIds),
      upload: (file) => uploadDraftAsset(projectId, file),
      onSaved: (value) =>
        queryClient.setQueryData<ProjectDocument>(
          projectDocumentKey(projectId, value.id),
          (cached) =>
            cached && cached.revision > value.revision ? cached : value,
        ),
      onListStale: () =>
        void queryClient.invalidateQueries({
          queryKey: projectDocumentsKey(projectId),
          exact: true,
        }),
    },
  });
}
