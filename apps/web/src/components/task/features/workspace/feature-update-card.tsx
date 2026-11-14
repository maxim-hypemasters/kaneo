import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DocumentEditor } from "@/components/editor/document-editor";
import { useDocumentDraftGuard } from "@/components/editor/document-draft-guard";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  deleteFeatureUpdate,
  editFeatureUpdate,
} from "@/fetchers/feature/feature-workspace";
import type {
  FeatureActivityItem,
  FeatureHealth,
  FeatureUpdateInput,
} from "@/fetchers/feature/types";
import { useFeatureWorkspaceMutation } from "@/hooks/mutations/feature/use-feature-workspace-mutation";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import { uploadDraftAsset } from "@/lib/upload-draft-asset";
import { FeatureHealthValue } from "./feature-health";
import { FeatureHealthSelect } from "./feature-health-select";
import { featureUpdateData } from "./feature-update-data";
import { FeatureUpdateProgress } from "./feature-update-progress";
import { WorkspaceDeleteDialog } from "./workspace-delete-dialog";

export function FeatureUpdateCard({
  activity,
  projectId,
  compact = false,
  onDeleted,
}: {
  activity: FeatureActivityItem;
  projectId: string;
  compact?: boolean;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { canUpdateFeatures } = useWorkspacePermission();
  const data = featureUpdateData(activity.eventData);
  const [draft, setDraft] = useState<{
    note: string;
    health: FeatureHealth;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const deletionNotified = useRef(false);
  const assetIds = useRef<string[]>([]);
  const save = useFeatureWorkspaceMutation(
    projectId,
    activity.taskId,
    (input: FeatureUpdateInput) =>
      editFeatureUpdate(activity.taskId, activity.id, input),
  );
  const remove = useFeatureWorkspaceMutation(projectId, activity.taskId, () =>
    deleteFeatureUpdate(activity.taskId, activity.id),
  );
  const canEdit = Boolean(
    !compact && user?.id === activity.userId && canUpdateFeatures(),
  );
  const pending = save.isPending || remove.isPending || uploading;
  const cancel = () => {
    if (!pending) {
      setDraft(null);
      assetIds.current = [];
      save.reset();
    }
  };
  useDocumentDraftGuard({
    dirty: Boolean(
      draft &&
      (draft.note !== activity.content || draft.health !== data?.health),
    ),
    saving: pending,
    onDiscard: cancel,
  });
  useEffect(() => {
    if (deleted && !pending && !deletionNotified.current) {
      deletionNotified.current = true;
      onDeleted?.();
    }
  }, [deleted, pending, onDeleted]);
  if (!data)
    return (
      <article
        id={`feature-update-${activity.id}`}
        className="space-y-2 rounded-xl border border-border bg-card/40 p-4 text-sm text-muted-foreground"
      >
        <p>{t("tasks:features.workspace.updateUnavailable")}</p>
        <time
          dateTime={activity.createdAt}
          title={formatDateTime(activity.createdAt)}
          className="text-xs"
        >
          {formatRelativeTime(activity.createdAt)}
        </time>
      </article>
    );
  async function submit() {
    if (!draft?.note.trim() || !canEdit || pending) return;
    try {
      await save.mutateAsync({
        ...draft,
        draftAssetIds: assetIds.current.filter((id) =>
          draft.note.includes(`/asset/${id}`),
        ),
      });
      setDraft(null);
      assetIds.current = [];
    } catch {
      /* Retain the editor and uploaded references for retry. */
    }
  }
  return (
    <article
      id={`feature-update-${activity.id}`}
      className="min-w-0 space-y-4 rounded-xl border border-border bg-card/40 p-4"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        <FeatureHealthValue health={data.health} />
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Avatar className="size-5">
            <AvatarImage src={activity.userImage ?? undefined} alt="" />
            <AvatarFallback className="text-[9px]">
              {getInitials(activity.userName)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate">
            {activity.userName || t("common:people.someone")}
          </span>
        </span>
        <time
          dateTime={activity.createdAt}
          title={formatDateTime(activity.createdAt)}
        >
          {formatRelativeTime(activity.createdAt)}
        </time>
        {canEdit && !draft && (
          <div className="ml-auto flex gap-1">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={t("tasks:features.workspace.editUpdate")}
              onClick={() => {
                setDraft({ note: activity.content ?? "", health: data.health });
                save.reset();
              }}
            >
              <Pencil />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={t("tasks:features.workspace.deleteUpdate")}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </header>
      {draft ? (
        <FeatureHealthSelect
          value={draft.health}
          onChange={(health) => setDraft({ ...draft, health })}
          disabled={pending || !canEdit}
        />
      ) : null}
      <DocumentEditor
        documentKey={`${activity.id}:${draft ? "edit" : "read"}`}
        value={draft?.note ?? activity.content ?? ""}
        onChange={(note) => {
          if (draft) setDraft({ ...draft, note });
        }}
        ariaLabel={t("tasks:features.workspace.updateNote")}
        readOnly={!draft || !canEdit}
        disabled={pending}
        className={compact ? "[&_.ProseMirror]:line-clamp-3" : undefined}
        onPendingUploadChange={setUploading}
        uploadAsset={
          draft && canEdit
            ? async (file) => {
                const asset = await uploadDraftAsset(
                  projectId,
                  file,
                  activity.taskId,
                );
                assetIds.current.push(asset.id);
                return asset;
              }
            : undefined
        }
        footer={
          draft ? (
            <div className="space-y-2">
              {save.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {t("common:documentEditor.saveFailed")}
                </p>
              )}
              {!canEdit && (
                <p role="alert" className="text-sm text-muted-foreground">
                  {t("common:documentEditor.permissionLost")}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={cancel}
                >
                  {t("common:actions.cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || !canEdit || !draft.note.trim()}
                  onClick={() => void submit()}
                >
                  {t("common:documentEditor.save")}
                </Button>
              </div>
            </div>
          ) : undefined
        }
      />
      <FeatureUpdateProgress milestones={data.milestones} compact={compact} />
      <WorkspaceDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("tasks:features.workspace.deleteUpdate")}
        description={t("tasks:features.workspace.deleteUpdateConfirm")}
        pending={remove.isPending}
        failed={remove.isError}
        onConfirm={() => {
          if (canEdit)
            void remove
              .mutateAsync()
              .then(() => {
                setDeleteOpen(false);
                setDeleted(true);
              })
              .catch(() => {});
        }}
      />
    </article>
  );
}
