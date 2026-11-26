import { useQueryClient } from "@tanstack/react-query";
import type { RefObject } from "react";
import {
  anchorUpdatesFor,
  type CommentAnchorSnapshot,
} from "@/components/documents/comments/comment-anchor-snapshot";
import { useDocumentAutosave } from "@/components/documents/use-document-autosave";
import type { DocumentCommentThread } from "@/fetchers/document-comment/types";
import {
  pruneFeatureAssets,
  updateFeatureDocument,
} from "@/fetchers/feature/feature-workspace";
import type { FeatureDocument } from "@/fetchers/feature/types";
import type { ProjectDocumentTree } from "@/fetchers/project-document/types";
import { withAnchors } from "@/hooks/mutations/document-comment/thread-cache";
import { documentCommentsKey } from "@/hooks/queries/document-comment/document-comment-keys";
import { featureWorkspaceKey } from "@/hooks/queries/feature/use-feature-workspace";
import { projectDocumentsKey } from "@/hooks/queries/project-document/project-document-keys";
import { withDocumentTitle } from "@/hooks/queries/project-document/with-document-title";
import { uploadDraftAsset } from "@/lib/upload-draft-asset";

// Not useFeatureWorkspaceMutation: refreshing the whole workspace, task and
// activity after every keystroke pause would refetch far too much.
export function useFeatureDocumentAutosave({
  projectId,
  featureId,
  document,
  canEdit,
  refresh,
  commentAnchors,
}: {
  projectId: string;
  featureId: string;
  document: FeatureDocument;
  canEdit: boolean;
  refresh: () => Promise<unknown>;
  // Where the comment threads' quoted text is now, for saves that moved it.
  commentAnchors?: RefObject<CommentAnchorSnapshot | null>;
}) {
  const queryClient = useQueryClient();
  const key = featureWorkspaceKey(projectId, featureId);
  return useDocumentAutosave({
    document,
    canEdit,
    refresh,
    source: {
      save: async (input) => {
        const anchors = anchorUpdatesFor(input, commentAnchors?.current);
        const saved = await updateFeatureDocument(
          featureId,
          document.id,
          anchors.length > 0 ? { ...input, commentAnchors: anchors } : input,
        );
        // The other windows refetch on the save's event; this one never
        // hears its own, so it records what it just sent.
        if (anchors.length > 0)
          queryClient.setQueryData<DocumentCommentThread[]>(
            documentCommentsKey(projectId, document.id),
            (threads) => threads && withAnchors(threads, anchors),
          );
        return saved;
      },
      prune: (assetIds) => pruneFeatureAssets(featureId, assetIds),
      upload: (file) => uploadDraftAsset(projectId, file, featureId),
      onSaved: (value) => {
        queryClient.setQueryData<FeatureDocument>(
          [...key, "document", value.id],
          (cached) =>
            cached && cached.revision > value.revision ? cached : value,
        );
        // The documents panel shows the title while the document is open.
        queryClient.setQueryData<ProjectDocumentTree>(
          projectDocumentsKey(projectId),
          (tree) => tree && withDocumentTitle(tree, value.id, value.title),
        );
      },
      onListStale: () =>
        void queryClient.invalidateQueries({ queryKey: [...key, "documents"] }),
    },
  });
}
