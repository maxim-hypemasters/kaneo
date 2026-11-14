import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DocumentEditor } from "@/components/editor/document-editor";
import type { DocumentEditorHandle } from "@/components/editor/document-editor-types";
import { useDocumentDraftGuard } from "@/components/editor/document-draft-guard";
import { DescriptionConflict } from "@/components/task/description-conflict";
import { Button } from "@/components/ui/button";
import { deleteFeatureDocument } from "@/fetchers/feature/feature-workspace";
import type { FeatureDocument } from "@/fetchers/feature/types";
import { useFeatureWorkspaceMutation } from "@/hooks/mutations/feature/use-feature-workspace-mutation";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatDateTime } from "@/lib/format";
import { FeatureDocumentSaveStatus } from "./feature-document-save-status";
import { FeatureDocumentTitle } from "./feature-document-title";
import { FeatureDocumentWindow } from "./feature-document-window";
import { useFeatureDocumentAutosave } from "./use-feature-document-autosave";
import { WorkspaceDeleteDialog } from "./workspace-delete-dialog";

export function FeatureDocumentPage({
  featureId,
  projectId,
  document,
  focusTitle = false,
  onBack,
  refresh,
}: {
  featureId: string;
  projectId: string;
  document: FeatureDocument;
  // Set for a document just created, so its title can be typed over.
  focusTitle?: boolean;
  onBack: () => void;
  refresh: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const { canUpdateFeatures, canDeleteFeatures } = useWorkspacePermission();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const editor = useRef<DocumentEditorHandle>(null);
  const draft = useFeatureDocumentAutosave({
    featureId,
    projectId,
    document,
    canEdit: canUpdateFeatures(),
    refresh,
  });
  const remove = useFeatureWorkspaceMutation(projectId, featureId, () =>
    deleteFeatureDocument(featureId, document.id),
  );
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
  const title = draft.value.title.trim() || document.title;

  return (
    <FeatureDocumentWindow
      title={title}
      onClose={onBack}
      closeDisabled={pending}
      actions={
        <>
          {draft.editable && (
            <FeatureDocumentSaveStatus
              status={draft.status}
              onRetry={draft.retry}
            />
          )}
          {canDeleteFeatures() && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
              aria-label={t("tasks:features.workspace.deleteDocument")}
            >
              <Trash2 />
            </Button>
          )}
        </>
      }
    >
      <FeatureDocumentTitle
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
        onChange={draft.changeBody}
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
      <WorkspaceDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("tasks:features.workspace.deleteDocument")}
        description={t("tasks:features.workspace.deleteDocumentConfirm", {
          title: document.title,
        })}
        pending={remove.isPending}
        failed={remove.isError}
        onConfirm={() => {
          if (!canDeleteFeatures()) return;
          void remove
            .mutateAsync()
            .then(() => {
              // Nothing is left to save once the document is gone.
              draft.discard();
              setDeleted(true);
            })
            .catch(() => {});
        }}
      />
    </FeatureDocumentWindow>
  );
}
