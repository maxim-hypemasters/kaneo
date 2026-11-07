import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DocumentEditor } from "@/components/editor/document-editor";
import { useDocumentDraftGuard } from "@/components/editor/document-draft-guard";
import { Button } from "@/components/ui/button";
import { publishFeatureUpdate } from "@/fetchers/feature/feature-workspace";
import type { FeatureHealth } from "@/fetchers/feature/types";
import { useFeatureWorkspaceMutation } from "@/hooks/mutations/feature/use-feature-workspace-mutation";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { uploadDraftAsset } from "@/lib/upload-draft-asset";
import { FeatureHealthSelect } from "./feature-health-select";

export function FeatureUpdateComposer({
  featureId,
  projectId,
  header,
}: {
  featureId: string;
  projectId: string;
  header?: ReactNode;
}) {
  const { t } = useTranslation();
  const { canUpdateTasks } = useWorkspacePermission();
  const [note, setNote] = useState("");
  const [health, setHealth] = useState<FeatureHealth>("on-track");
  const [uploading, setUploading] = useState(false);
  const [session, setSession] = useState(0);
  const assetIds = useRef<string[]>([]);
  const writeInFlight = useRef(false);
  const mutation = useFeatureWorkspaceMutation(
    projectId,
    featureId,
    (input: { note: string; health: FeatureHealth; draftAssetIds: string[] }) =>
      publishFeatureUpdate(featureId, input),
  );
  const reset = () => {
    setNote("");
    setHealth("on-track");
    assetIds.current = [];
    setSession((value) => value + 1);
    mutation.reset();
  };
  useDocumentDraftGuard({
    dirty: Boolean(note.trim() || health !== "on-track"),
    saving: mutation.isPending || uploading,
    onDiscard: reset,
  });
  async function submit() {
    if (
      !note.trim() ||
      !health ||
      !canUpdateTasks() ||
      uploading ||
      writeInFlight.current
    )
      return;
    writeInFlight.current = true;
    try {
      await mutation.mutateAsync({
        note,
        health,
        draftAssetIds: assetIds.current.filter((id) =>
          note.includes(`/asset/${id}`),
        ),
      });
      reset();
    } catch {
      /* The mutation retains the draft and displays retry feedback. */
    } finally {
      writeInFlight.current = false;
    }
  }
  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap items-center justify-between gap-2"
        data-slot="feature-update-composer-header"
      >
        {header}
        <div className="ms-auto">
          <FeatureHealthSelect
            value={health}
            onChange={setHealth}
            disabled={mutation.isPending || uploading || !canUpdateTasks()}
          />
        </div>
      </div>
      <DocumentEditor
        documentKey={`${featureId}:update:${session}`}
        value={note}
        onChange={setNote}
        ariaLabel={t("tasks:features.workspace.updateNote")}
        placeholder={t("tasks:features.workspace.updatePlaceholder")}
        readOnly={!canUpdateTasks()}
        disabled={mutation.isPending}
        onPendingUploadChange={setUploading}
        uploadAsset={
          canUpdateTasks()
            ? async (file) => {
                const asset = await uploadDraftAsset(
                  projectId,
                  file,
                  featureId,
                );
                assetIds.current.push(asset.id);
                return asset;
              }
            : undefined
        }
        footer={
          <div className="flex flex-wrap items-center justify-end gap-3">
            {mutation.isError && (
              <p role="alert" className="mr-auto text-sm text-destructive">
                {t("tasks:features.workspace.publishFailed")}
              </p>
            )}
            {!canUpdateTasks() && (
              <p role="alert" className="mr-auto text-sm text-muted-foreground">
                {t("common:documentEditor.permissionLost")}
              </p>
            )}
            <Button
              type="button"
              size="sm"
              disabled={
                !canUpdateTasks() ||
                !note.trim() ||
                !health ||
                mutation.isPending ||
                uploading
              }
              onClick={() => void submit()}
              loading={mutation.isPending}
            >
              {t("tasks:features.workspace.publishUpdate")}
            </Button>
          </div>
        }
      />
    </div>
  );
}
