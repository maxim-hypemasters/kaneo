import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DocumentEditor } from "@/components/editor/document-editor";
import { useDocumentDraftGuard } from "@/components/editor/document-draft-guard";
import { DescriptionConflict } from "@/components/task/description-conflict";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteFeatureDocument } from "@/fetchers/feature/feature-workspace";
import type { FeatureDocument } from "@/fetchers/feature/types";
import { useFeatureWorkspaceMutation } from "@/hooks/mutations/feature/use-feature-workspace-mutation";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { FeatureDocumentWindow } from "./feature-document-window";
import { useFeatureDocumentDraft } from "./use-feature-document-draft";
import { WorkspaceDeleteDialog } from "./workspace-delete-dialog";

export function FeatureDocumentPage({
  featureId,
  projectId,
  document,
  onBack,
  onSaved,
  refresh,
  onCancelNew,
}: {
  featureId: string;
  projectId: string;
  document?: FeatureDocument;
  onBack: () => void;
  onSaved: (document: FeatureDocument) => void;
  refresh: () => Promise<unknown>;
  onCancelNew?: () => void;
}) {
  const { t } = useTranslation();
  const { canUpdateTasks, canDeleteTasks } = useWorkspacePermission();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const draft = useFeatureDocumentDraft({
    featureId,
    projectId,
    document,
    canEdit: canUpdateTasks(),
    refresh,
    onSaved,
  });
  const remove = useFeatureWorkspaceMutation(projectId, featureId, () =>
    deleteFeatureDocument(featureId, document?.id ?? ""),
  );
  const pending = draft.saving || draft.uploading || remove.isPending;
  useDocumentDraftGuard({
    dirty: draft.dirty,
    saving: pending,
    onDiscard: draft.cancel,
  });
  useEffect(() => {
    if (deleted && !pending) onBack();
  }, [deleted, pending, onBack]);
  return (
    <FeatureDocumentWindow
      title={
        draft.value.title ||
        document?.title ||
        t("tasks:features.workspace.newDocument")
      }
      onClose={onBack}
      closeDisabled={pending}
      actions={
        document &&
        !draft.editing && (
          <>
            {canUpdateTasks() && (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={draft.edit}
                aria-label={t("tasks:features.workspace.renameDocument")}
              >
                <Pencil />
              </Button>
            )}
            {canDeleteTasks() && (
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
        )
      }
    >
      {draft.editing ? (
        <Input
          value={draft.value.title}
          onChange={(event) => draft.change({ title: event.target.value })}
          aria-label={t("tasks:features.workspace.documentTitle")}
          placeholder={t("tasks:features.workspace.documentTitle")}
          disabled={pending || !canUpdateTasks()}
          maxLength={200}
          autoFocus={!document}
          className="font-medium"
        />
      ) : (
        // Indented like the editor's text, so the page reads in one column.
        <h3 className="break-words px-3 text-2xl font-semibold sm:px-4">
          {draft.value.title}
        </h3>
      )}
      {document && (
        <p
          className={cn(
            "text-xs text-muted-foreground",
            !draft.editing && "px-3 sm:px-4",
          )}
        >
          {t("tasks:features.workspace.documentUpdated", {
            name: document.updatedByName || t("common:people.someone"),
            date: formatDateTime(document.updatedAt),
          })}
        </p>
      )}
      <DocumentEditor
        documentKey={`${document?.id ?? "new"}:${draft.session}`}
        value={draft.value.body}
        onChange={(body) => draft.change({ body })}
        onRequestEdit={
          !draft.editing && canUpdateTasks() ? draft.edit : undefined
        }
        ariaLabel={
          draft.value.title || t("tasks:features.workspace.documentBody")
        }
        placeholder={t("tasks:features.workspace.documentPlaceholder")}
        readOnly={!draft.editing || !canUpdateTasks()}
        disabled={pending}
        expandable={false}
        uploadAsset={
          draft.editing && canUpdateTasks() ? draft.upload : undefined
        }
        onPendingUploadChange={draft.setUploading}
        notice={
          draft.conflict ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{document?.title}</p>
              <DescriptionConflict
                latest={document?.body ?? ""}
                pending={draft.refreshing}
                available={draft.reviewAvailable}
                onRefresh={() => void draft.refreshLatest().catch(() => {})}
                onKeepDraft={draft.keepDraft}
                onUseLatest={draft.cancel}
              />
            </div>
          ) : undefined
        }
        footer={
          draft.editing ? (
            <div className="space-y-3">
              {!canUpdateTasks() && (
                <p role="alert" className="text-sm text-muted-foreground">
                  {t("common:documentEditor.permissionLost")}
                </p>
              )}
              {draft.error && !draft.conflict ? (
                <p role="alert" className="text-sm text-destructive">
                  {t("common:documentEditor.saveFailed")}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    draft.cancel();
                    if (!document) onCancelNew?.();
                  }}
                >
                  {t("common:actions.cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    !canUpdateTasks() ||
                    pending ||
                    draft.conflict ||
                    !draft.value.title.trim()
                  }
                  onClick={() => void draft.save()}
                  loading={draft.saving}
                >
                  {t("common:documentEditor.save")}
                </Button>
              </div>
            </div>
          ) : undefined
        }
      />
      <WorkspaceDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("tasks:features.workspace.deleteDocument")}
        description={t("tasks:features.workspace.deleteDocumentConfirm", {
          title: document?.title,
        })}
        pending={remove.isPending}
        failed={remove.isError}
        onConfirm={() => {
          if (canDeleteTasks())
            void remove
              .mutateAsync()
              .then(() => setDeleted(true))
              .catch(() => {});
        }}
      />
    </FeatureDocumentWindow>
  );
}
