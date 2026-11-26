import { FilePlusIcon } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { AgentSuggestion } from "@/fetchers/agent/get-task-agent";
import { useApplyTaskAgentSuggestion } from "@/hooks/mutations/agent/use-apply-task-agent-suggestion";
import { useDismissTaskAgentSuggestion } from "@/hooks/mutations/agent/use-dismiss-task-agent-suggestion";

type ClarifySuggestionProps = {
  taskId: string;
  suggestion: AgentSuggestion;
  canUpdate: boolean;
};

export function ClarifySuggestion({
  taskId,
  suggestion,
  canUpdate,
}: ClarifySuggestionProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const apply = useApplyTaskAgentSuggestion();
  const dismiss = useDismissTaskAgentSuggestion();
  const busy = apply.isPending || dismiss.isPending;
  const variables = { taskId, suggestionId: suggestion.id };

  return (
    <li className="space-y-2 rounded-lg border border-border bg-background/60 p-3">
      <p id={titleId} className="text-sm font-medium">
        {suggestion.title}
      </p>
      <pre
        role="region"
        aria-labelledby={titleId}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A scrollable region must be focusable for keyboard scrolling in every browser.
        tabIndex={0}
        className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 px-2.5 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {suggestion.markdown}
      </pre>
      {canUpdate ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            loading={apply.isPending}
            disabled={busy}
            onClick={() => apply.mutate(variables)}
          >
            <FilePlusIcon aria-hidden="true" />
            {t("tasks:aiAgent.suggestions.apply")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            loading={dismiss.isPending}
            disabled={busy}
            aria-label={t("tasks:aiAgent.suggestions.dismissLabel", {
              title: suggestion.title,
            })}
            onClick={() => dismiss.mutate(variables)}
          >
            {t("tasks:aiAgent.suggestions.dismiss")}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
