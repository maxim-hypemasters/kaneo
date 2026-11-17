import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { useRemoveAssistantSettings } from "@/hooks/mutations/assistant/use-remove-assistant-settings";

type RemoveAssistantKeyDialogProps = {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RemoveAssistantKeyDialog({
  workspaceId,
  open,
  onOpenChange,
}: RemoveAssistantKeyDialogProps) {
  const { t } = useTranslation();
  const { mutateAsync, isPending } = useRemoveAssistantSettings();

  const remove = async () => {
    try {
      await mutateAsync(workspaceId);
      onOpenChange(false);
    } catch {
      // The mutation toasts the failure; the dialog stays open to retry.
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("settings:assistantPage.remove.dialogTitle")}
      description={t("settings:assistantPage.remove.dialogDescription")}
      confirmLabel={t("settings:assistantPage.remove.confirm")}
      pendingLabel={t("settings:assistantPage.remove.removing")}
      pending={isPending}
      onConfirm={() => void remove()}
    />
  );
}
