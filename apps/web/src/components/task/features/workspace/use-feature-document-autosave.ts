import { useQueryClient } from "@tanstack/react-query";
import { useDocumentAutosave } from "@/components/documents/use-document-autosave";
import {
  pruneFeatureAssets,
  updateFeatureDocument,
} from "@/fetchers/feature/feature-workspace";
import type { FeatureDocument } from "@/fetchers/feature/types";
import { featureWorkspaceKey } from "@/hooks/queries/feature/use-feature-workspace";
import { uploadDraftAsset } from "@/lib/upload-draft-asset";

// Not useFeatureWorkspaceMutation: refreshing the whole workspace, task and
// activity after every keystroke pause would refetch far too much.
export function useFeatureDocumentAutosave({
  projectId,
  featureId,
  document,
  canEdit,
  refresh,
}: {
  projectId: string;
  featureId: string;
  document: FeatureDocument;
  canEdit: boolean;
  refresh: () => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const key = featureWorkspaceKey(projectId, featureId);
  return useDocumentAutosave({
    document,
    canEdit,
    refresh,
    source: {
      save: (input) => updateFeatureDocument(featureId, document.id, input),
      prune: (assetIds) => pruneFeatureAssets(featureId, assetIds),
      upload: (file) => uploadDraftAsset(projectId, file, featureId),
      onSaved: (value) =>
        queryClient.setQueryData<FeatureDocument>(
          [...key, "document", value.id],
          (cached) =>
            cached && cached.revision > value.revision ? cached : value,
        ),
      onListStale: () =>
        void queryClient.invalidateQueries({ queryKey: [...key, "documents"] }),
    },
  });
}
