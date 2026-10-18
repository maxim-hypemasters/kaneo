import { Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { useDeleteRelease } from "@/hooks/mutations/release/use-delete-release";
import { toast } from "@/lib/toast";
import type { Release } from "@/types/release";

type DeleteReleaseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  release: Release | null;
  // Every task and feature in it, archived ones included: all lose the
  // release.
  itemCount: number;
  onDeleted?: () => void;
};

export function DeleteReleaseDialog({
  open,
  onOpenChange,
  release,
  itemCount,
  onDeleted,
}: DeleteReleaseDialogProps) {
  const { t } = useTranslation();
  const deleteRelease = useDeleteRelease();

  const handleConfirm = async () => {
    if (!release) return;
    try {
      await deleteRelease.mutateAsync({
        id: release.id,
        projectId: release.projectId,
      });
      toast.success(t("tasks:releases.deleteDialog.success"), {
        icon: Trash2Icon,
      });
      onOpenChange(false);
      onDeleted?.();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:releases.deleteDialog.error"),
      );
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (next || !deleteRelease.isPending) onOpenChange(next);
      }}
      title={t("tasks:releases.deleteDialog.title", {
        name: release?.name ?? "",
      })}
      description={
        itemCount > 0
          ? t("tasks:releases.deleteDialog.description", { count: itemCount })
          : t("tasks:releases.deleteDialog.descriptionEmpty")
      }
      confirmLabel={t("tasks:releases.deleteDialog.confirm")}
      pendingLabel={t("common:actions.deleting")}
      pending={deleteRelease.isPending}
      onConfirm={handleConfirm}
    />
  );
}
