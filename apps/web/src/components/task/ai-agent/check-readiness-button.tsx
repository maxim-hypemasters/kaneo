import { RefreshCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useRequestTaskAssessment } from "@/hooks/mutations/agent/use-request-task-assessment";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";

type CheckReadinessButtonProps = {
  taskId: string;
  /** The server is checking already. */
  assessing: boolean;
  /** Says "Check again" rather than "Check now". */
  again: boolean;
};

export function CheckReadinessButton({
  taskId,
  assessing,
  again,
}: CheckReadinessButtonProps) {
  const { t } = useTranslation();
  const { mutate: requestAssessment, isPending } = useRequestTaskAssessment();
  const busy = isPending || assessing;

  // A scheduled check starts now instead of waiting out the edit window.
  const check = () =>
    requestAssessment(taskId, {
      onError: () => toast.error(t("tasks:aiAgent.errors.assess")),
    });

  return (
    // Stays mounted and focusable while a check runs (a disabled button
    // drops focus), and ignores presses until it ends.
    <Button
      type="button"
      variant="ghost"
      size="xs"
      aria-disabled={busy || undefined}
      className="aria-disabled:pointer-events-none aria-disabled:opacity-64"
      onClick={busy ? undefined : check}
    >
      <RefreshCwIcon
        aria-hidden="true"
        className={cn(busy && "animate-spin")}
      />
      {again ? t("tasks:aiAgent.checkAgain") : t("tasks:aiAgent.checkNow")}
    </Button>
  );
}
