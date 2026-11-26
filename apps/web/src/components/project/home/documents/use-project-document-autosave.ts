import { useQueryClient } from "@tanstack/react-query";
import type { RefObject } from "react";
import {
  anchorUpdatesFor,
  type CommentAnchorSnapshot,
} from "@/components/documents/comments/comment-anchor-snapshot";
import { useDocumentAutosave } from "@/components/documents/use-document-autosave";
import type { DocumentCommentThread } from "@/fetchers/document-comment/types";
import { pruneProjectDocumentAssets } from "@/fetchers/project-document/prune-project-document-assets";
import type {
  ProjectDocument,
  ProjectDocumentTree,
} from "@/fetchers/project-document/types";
import { updateProjectDocument } from "@/fetchers/project-document/update-project-document";
import { withAnchors } from "@/hooks/mutations/document-comment/thread-cache";
import { documentCommentsKey } from "@/hooks/queries/document-comment/document-comment-keys";
import {
  projectDocumentKey,
  projectDocumentsKey,
} from "@/hooks/queries/project-document/project-document-keys";
import { withDocumentTitle } from "@/hooks/queries/project-document/with-document-title";
import { uploadProjectDocumentAsset } from "@/lib/upload-draft-asset";

// Uploads are staged on the project under document permissions and claimed
// by the save that first references them, like Feature documents.
export function useProjectDocumentAutosave({
  projectId,
  document,
  canEdit,
  refresh,
  commentAnchors,
}: {
  projectId: string;
  document: ProjectDocument;
  canEdit: boolean;
  refresh: () => Promise<unknown>;
  // Where the comment threads' quoted text is now, for saves that moved it.
  commentAnchors?: RefObject<CommentAnchorSnapshot | null>;
}) {
  const queryClient = useQueryClient();
  return useDocumentAutosave({
    document,
    canEdit,
    refresh,
    source: {
      save: async (input) => {
        const anchors = anchorUpdatesFor(input, commentAnchors?.current);
        const saved = await updateProjectDocument(
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
      prune: (assetIds) => pruneProjectDocumentAssets(document.id, assetIds),
      upload: (file) => uploadProjectDocumentAsset(projectId, file),
      onSaved: (value) => {
        queryClient.setQueryData<ProjectDocument>(
          projectDocumentKey(projectId, value.id),
          (cached) =>
            cached && cached.revision > value.revision ? cached : value,
        );
        // The documents panel shows the title while the page is open.
        queryClient.setQueryData<ProjectDocumentTree>(
          projectDocumentsKey(projectId),
          (tree) => tree && withDocumentTitle(tree, value.id, value.title),
        );
      },
      onListStale: () =>
        void queryClient.invalidateQueries({
          queryKey: projectDocumentsKey(projectId),
          exact: true,
        }),
    },
  });
}
