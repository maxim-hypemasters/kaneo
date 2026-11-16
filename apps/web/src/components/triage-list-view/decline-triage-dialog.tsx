import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type DeclineTriageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  pending: boolean;
  onDecline: (reason: string) => void;
};

export function DeclineTriageDialog({
  open,
  onOpenChange,
  taskTitle,
  pending,
  onDecline,
}: DeclineTriageDialogProps) {
  const { t } = useTranslation();
  const reasonId = useId();
  const [reason, setReason] = useState("");

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
      title={t("tasks:triage.declineDialog.title", { title: taskTitle })}
      description={t("tasks:triage.declineDialog.description")}
      confirmLabel={t("tasks:triage.declineDialog.confirm")}
      pendingLabel={t("tasks:triage.declineDialog.pending")}
      pending={pending}
      onConfirm={() => onDecline(reason.trim())}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={reasonId}>
          {t("tasks:triage.declineDialog.reasonLabel")}
        </Label>
        <Textarea
          id={reasonId}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("tasks:triage.declineDialog.reasonPlaceholder")}
          maxLength={10_000}
          rows={3}
        />
      </div>
    </ConfirmDialog>
  );
}
