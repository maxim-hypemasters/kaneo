import { useTranslation } from "react-i18next";
import { DocumentEditor } from "@/components/editor/document-editor";
import { useDocumentDraftGuard } from "@/components/editor/document-draft-guard";
import { Button } from "@/components/ui/button";
import { DescriptionConflict } from "./description-conflict";
import { useDescriptionDraft } from "./use-description-draft";

export function TaskDescriptionDocument({
  taskId,
  projectId,
  description,
  canEdit,
  refresh,
}: {
  taskId: string;
  projectId: string;
  description: string;
  canEdit: boolean;
  refresh: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const draft = useDescriptionDraft({
    taskId,
    projectId,
    description,
    canEdit,
    refresh,
  });
  useDocumentDraftGuard({
    dirty: draft.dirty,
    saving: draft.saving || draft.uploading,
    onDiscard: draft.cancel,
  });

  return (
    <section data-task-action="description">
      <DocumentEditor
        documentKey={`${taskId}:${draft.session}`}
        value={draft.value}
        onChange={draft.change}
        onRequestEdit={!draft.editing && canEdit ? draft.edit : undefined}
        ariaLabel={t("common:documentEditor.description")}
        placeholder={t("tasks:detail.addDescription")}
        readOnly={!draft.editing || !canEdit}
        disabled={draft.saving}
        uploadAsset={draft.editing && canEdit ? draft.upload : undefined}
        onPendingUploadChange={draft.setUploading}
        notice={
          draft.conflict ? (
            <DescriptionConflict
              latest={description}
              pending={draft.refreshing}
              available={draft.reviewAvailable}
              onRefresh={() => void draft.refreshLatest()}
              onKeepDraft={draft.keepDraft}
              onUseLatest={draft.cancel}
            />
          ) : undefined
        }
        footer={
          draft.editing ? (
            <div className="space-y-3">
              {!canEdit && (
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
                  disabled={draft.saving || draft.uploading}
                  onClick={draft.cancel}
                >
                  {t("common:actions.cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    !canEdit ||
                    draft.saving ||
                    draft.uploading ||
                    draft.conflict
                  }
                  onClick={() => void draft.save()}
                >
                  {t(
                    draft.saving
                      ? "common:documentEditor.saving"
                      : "common:documentEditor.save",
                  )}
                </Button>
              </div>
            </div>
          ) : undefined
        }
      />
    </section>
  );
}
