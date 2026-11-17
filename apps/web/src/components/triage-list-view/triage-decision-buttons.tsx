import { CheckIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { stopCardEvents } from "@/components/task-chips/stop-card-events";
import { Button } from "@/components/ui/button";
import { useAcceptTriage } from "@/hooks/mutations/triage/use-accept-triage";
import { useDeclineTriage } from "@/hooks/mutations/triage/use-decline-triage";
import { toast } from "@/lib/toast";
import { DeclineTriageDialog } from "./decline-triage-dialog";

type TriageDecisionButtonsProps = {
  taskId: string;
  taskTitle: string;
  onDecided?: () => void;
};

export function TriageDecisionButtons({
  taskId,
  taskTitle,
  onDecided,
}: TriageDecisionButtonsProps) {
  const { t } = useTranslation();
  const [declineOpen, setDeclineOpen] = useState(false);
  const accept = useAcceptTriage();
  const decline = useDeclineTriage();
  const busy = accept.isPending || decline.isPending;

  const handleAccept = async () => {
    try {
      await accept.mutateAsync(taskId);
      toast.success(t("tasks:triage.accepted"), { icon: CheckIcon });
      onDecided?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("tasks:triage.acceptError"),
      );
    }
  };

  const handleDecline = async (reason: string) => {
    try {
      await decline.mutateAsync({ taskId, reason: reason || undefined });
      setDeclineOpen(false);
      toast.success(t("tasks:triage.declined"), { icon: XIcon });
      onDecided?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("tasks:triage.declineError"),
      );
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-1" {...stopCardEvents}>
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={busy}
        onClick={handleAccept}
        aria-label={t("tasks:triage.acceptLabel", { title: taskTitle })}
      >
        <CheckIcon aria-hidden="true" />
        {t("tasks:triage.accept")}
      </Button>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={busy}
        onClick={() => setDeclineOpen(true)}
        aria-label={t("tasks:triage.declineLabel", { title: taskTitle })}
      >
        <XIcon aria-hidden="true" />
        {t("tasks:triage.decline")}
      </Button>
      <DeclineTriageDialog
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        taskTitle={taskTitle}
        pending={decline.isPending}
        onDecline={handleDecline}
      />
    </div>
  );
}
