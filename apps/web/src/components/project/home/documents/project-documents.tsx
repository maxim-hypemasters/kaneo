import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { DocumentWindowFrame } from "@/components/documents/document-window-frame";
import { useDocumentDraftNavigation } from "@/components/editor/document-draft-guard";
import { projectDocumentsKey } from "@/hooks/queries/project-document/project-document-keys";
import { useProjectDocuments } from "@/hooks/queries/project-document/use-project-documents";
import { DocumentsNavigator } from "./documents-navigator";
import type { OpenDocument } from "./open-document";
import { OpenFeatureDocument } from "./open-feature-document";
import { OpenProjectPage } from "./open-project-page";
import { descendantIds } from "./tree/page-tree";

export function ProjectDocuments({
  workspaceId,
  projectId,
  openDocument,
  onOpenDocument,
}: {
  workspaceId: string;
  projectId: string;
  openDocument: OpenDocument | null;
  onOpenDocument: (document: OpenDocument | null) => void;
}) {
  const queryClient = useQueryClient();
  const requestLeave = useDocumentDraftNavigation();
  const tree = useProjectDocuments(projectId);
  // The page just created opens with its title selected.
  const [createdId, setCreatedId] = useState<string>();

  // Leaving a document saves it first, or asks before dropping the draft.
  const leaveTo = useCallback(
    (next: OpenDocument | null, created = false) => {
      void requestLeave(() => {
        setCreatedId(created ? next?.id : undefined);
        onOpenDocument(next);
        // Feature document titles show in the list too.
        void queryClient.invalidateQueries({
          queryKey: projectDocumentsKey(projectId),
          exact: true,
        });
      });
    },
    [onOpenDocument, projectId, queryClient, requestLeave],
  );
  const back = useCallback(() => leaveTo(null), [leaveTo]);
  const open = (next: OpenDocument, options?: { created?: boolean }) => {
    if (!openDocument) {
      // Nothing is being edited yet.
      setCreatedId(options?.created ? next.id : undefined);
      onOpenDocument(next);
      return;
    }
    leaveTo(next, options?.created);
  };
  const navigator = (
    <DocumentsNavigator
      workspaceId={workspaceId}
      projectId={projectId}
      openDocument={openDocument}
      onOpen={open}
      onOpenRemoved={() => onOpenDocument(null)}
    />
  );

  return (
    <div className="mx-auto w-full max-w-225 px-4 pt-6 pb-16 sm:px-12 sm:pt-10">
      {openDocument && (
        <DocumentWindowFrame
          documentKey={openDocument.id}
          nav={navigator}
          onClose={back}
        >
          {openDocument.featureId ? (
            <OpenFeatureDocument
              projectId={projectId}
              featureId={openDocument.featureId}
              documentId={openDocument.id}
              commentId={openDocument.commentId}
              onBack={back}
            />
          ) : (
            <OpenProjectPage
              projectId={projectId}
              documentId={openDocument.id}
              subPageCount={
                descendantIds(tree.data?.pages ?? [], openDocument.id).size
              }
              focusTitle={createdId === openDocument.id}
              commentId={openDocument.commentId}
              onBack={back}
            />
          )}
        </DocumentWindowFrame>
      )}
      {navigator}
    </div>
  );
}
