import { CheckIcon, Loader2Icon, type LucideIcon } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useApplyTaskAgentSuggestion } from "@/hooks/mutations/agent/use-apply-task-agent-suggestion";
import { useDismissTaskAgentSuggestion } from "@/hooks/mutations/agent/use-dismiss-task-agent-suggestion";

type SuggestionActionsProps = {
  taskId: string;
  /** Field suggestions pass it: they change what the board and lists show. */
  projectId?: string;
  suggestionId: string;
  /** What the row sets; it names both buttons for screen readers. */
  label: string;
  /** Without it only Dismiss shows. */
  canApply: boolean;
  /** People who can't update the task see neither button. */
  canDismiss: boolean;
  /**
   * Replaces Apply's text and icon. Its name is then that text followed by
   * the element `titleId` points to, so it still says which suggestion.
   */
  applyAs?: { text: string; icon: LucideIcon; titleId: string };
};

// Both buttons stay focusable while either runs (a disabled button drops
// focus), so focus stays in the row until the row goes.
export function SuggestionActions({
  taskId,
  projectId,
  suggestionId,
  label,
  canApply,
  canDismiss,
  applyAs,
}: SuggestionActionsProps) {
  const { t } = useTranslation();
  const applyId = useId();
  const apply = useApplyTaskAgentSuggestion();
  const dismiss = useDismissTaskAgentSuggestion();
  const busy = apply.isPending || dismiss.isPending;
  const busyClassName =
    "aria-disabled:pointer-events-none aria-disabled:opacity-64";
  if (!canDismiss) return null;
  const ApplyIcon = applyAs?.icon ?? CheckIcon;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canApply ? (
        <Button
          id={applyId}
          type="button"
          variant="outline"
          size="xs"
          data-suggestion-action=""
          aria-label={
            applyAs
              ? undefined
              : t("tasks:aiAgent.suggestions.applyLabel", { title: label })
          }
          aria-labelledby={
            applyAs ? `${applyId} ${applyAs.titleId}` : undefined
          }
          aria-disabled={busy || undefined}
          className={busyClassName}
          onClick={
            busy
              ? undefined
              : () => apply.mutate({ taskId, projectId, suggestionId })
          }
        >
          {apply.isPending ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : (
            <ApplyIcon aria-hidden="true" />
          )}
          {applyAs?.text ?? t("tasks:aiAgent.suggestions.applyField")}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="xs"
        data-suggestion-action=""
        aria-label={t("tasks:aiAgent.suggestions.dismissLabel", {
          title: label,
        })}
        aria-disabled={busy || undefined}
        className={busyClassName}
        onClick={
          busy ? undefined : () => dismiss.mutate({ taskId, suggestionId })
        }
      >
        {t("tasks:aiAgent.suggestions.dismiss")}
      </Button>
    </div>
  );
}
