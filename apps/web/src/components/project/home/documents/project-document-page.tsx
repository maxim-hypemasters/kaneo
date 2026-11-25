import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CommentAnchorSnapshot } from "@/components/documents/comments/comment-anchor-snapshot";
import { DocumentCommentsAside } from "@/components/documents/comments/document-comments-aside";
import { DocumentCommentsButton } from "@/components/documents/comments/document-comments-button";
import { useDocumentComments } from "@/components/documents/comments/use-document-comments";
import { DocumentSaveIndicator } from "@/components/documents/document-save-indicator";
import { DocumentTitle } from "@/components/documents/document-title";
import { DocumentWindow } from "@/components/documents/document-window";
import { useDocumentDraftGuard } from "@/components/editor/document-draft-guard";
import { DocumentEditor } from "@/components/editor/document-editor";
import type { DocumentEditorHandle } from "@/components/editor/document-editor-types";
import { DescriptionConflict } from "@/components/task/description-conflict";
import { Button } from "@/components/ui/button";
import type { ProjectDocument } from "@/fetchers/project-document/types";
import { useDeleteProjectDocument } from "@/hooks/mutations/project-document/use-delete-project-document";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatDateTime } from "@/lib/format";
import { DeletePageDialog } from "./delete-page-dialog";
import { useProjectDocumentAutosave } from "./use-project-document-autosave";

export function ProjectDocumentPage({
  projectId,
  document,
  subPageCount,
  focusTitle = false,
  commentId,
  onBack,
  refresh,
}: {
  projectId: string;
  document: ProjectDocument;
  subPageCount: number;
  // Set for a page just created, so its title can be typed over.
  focusTitle?: boolean;
  // A comment thread to show, from a link to it.
  commentId?: string;
  onBack: () => void;
  refresh: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const { canUpdateDocuments, canDeleteDocuments } = useWorkspacePermission();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const editor = useRef<DocumentEditorHandle>(null);
  const commentAnchors = useRef<CommentAnchorSnapshot | null>(null);
  const draft = useProjectDocumentAutosave({
    projectId,
    document,
    canEdit: canUpdateDocuments(),
    refresh,
    commentAnchors,
  });
  // Commenting needs the same right as editing the page.
  const comments = useDocumentComments({
    document: { kind: "page", projectId, documentId: document.id },
    canComment: draft.editable,
    conflict: draft.conflict,
    flush: draft.flush,
    onAnchorsChange: (snapshot) => {
      commentAnchors.current = snapshot;
    },
    initialCommentId: commentId,
  });
  const remove = useDeleteProjectDocument(projectId);
  const pending = draft.uploading || remove.isPending;
  useDocumentDraftGuard({
    dirty: draft.unsaved,
    saving: pending,
    onDiscard: draft.discard,
    flush: draft.flush,
    finish: draft.prune,
  });
  useEffect(() => {
    if (deleted && !pending) onBack();
  }, [deleted, pending, onBack]);
  const title =
    draft.value.title.trim() ||
    document.title ||
    t("tasks:projectHome.documents.untitled");

  return (
    <DocumentWindow
      title={title}
      onClose={onBack}
      closeDisabled={pending}
      aside={<DocumentCommentsAside comments={comments} />}
      actions={
        <>
          {draft.editable && (
            <DocumentSaveIndicator
              status={draft.status}
              onRetry={draft.retry}
            />
          )}
          <DocumentCommentsButton
            ref={comments.toggle}
            open={comments.open}
            count={comments.openCount}
            controls={comments.panelId}
            onToggle={comments.toggleOpen}
          />
          {canDeleteDocuments() && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
              aria-label={t("tasks:projectHome.documents.delete")}
            >
              <Trash2 />
            </Button>
          )}
        </>
      }
    >
      <DocumentTitle
        value={draft.value.title}
        readOnly={!draft.editable}
        focus={focusTitle}
        onChange={draft.changeTitle}
        onCommit={draft.commitTitle}
        onEnterBody={() => editor.current?.focus("start")}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        {t("tasks:features.workspace.documentUpdated", {
          name: document.updatedByName || t("common:people.someone"),
          date: formatDateTime(document.updatedAt),
        })}
      </p>
      <DocumentEditor
        ref={editor}
        variant="page"
        className="mt-6"
        documentKey={document.id}
        value={draft.value.body}
        onChange={(body) => {
          draft.changeBody(body);
          comments.bodyChanged(body);
        }}
        comments={comments.editor}
        ariaLabel={title}
        placeholder={
          draft.editable
            ? t("common:documentEditor.slashHint")
            : t("tasks:features.workspace.emptyDocument")
        }
        readOnly={!draft.editable}
        // Only deletion locks the text: a disabled editor drops uploads that
        // finish while it is locked.
        disabled={remove.isPending}
        expandable={false}
        uploadAsset={draft.editable ? draft.upload : undefined}
        onPendingUploadChange={draft.setUploading}
        notice={
          draft.conflict ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{document.title}</p>
              <DescriptionConflict
                latest={document.body}
                pending={draft.refreshing}
                available={draft.reviewAvailable}
                onRefresh={() => void draft.refreshLatest()}
                onKeepDraft={draft.keepMine}
                onUseLatest={draft.acceptLatest}
              />
            </div>
          ) : !draft.editable && draft.unsaved ? (
            <p role="alert" className="text-sm text-muted-foreground">
              {t("common:documentEditor.permissionLost")}
            </p>
          ) : undefined
        }
      />
      <DeletePageDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={title}
        subPageCount={subPageCount}
        pending={remove.isPending}
        failed={remove.isError}
        onConfirm={() => {
          if (!canDeleteDocuments()) return;
          void remove
            .mutateAsync(document.id)
            .then(() => {
              // Nothing is left to save once the page is gone.
              draft.discard();
              setDeleted(true);
            })
            .catch(() => {});
        }}
      />
    </DocumentWindow>
  );
}
