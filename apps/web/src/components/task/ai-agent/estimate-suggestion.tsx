import { Timer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SuggestionActions } from "./suggestion-actions";
import { SuggestionRow } from "./suggestion-row";
import { estimatePlanText, estimateText } from "./suggestion-text";
import type { AgentEstimateSuggestion } from "./suggestion-types";

type EstimateSuggestionProps = {
  taskId: string;
  projectId: string;
  suggestion: AgentEstimateSuggestion;
  canApply: boolean;
  canDismiss: boolean;
};

// The effort Hermes expects, and the dates Kaneo planned for it around the
// person's time off and other dated work. Apply sets exactly what it shows:
// with no plan, the estimate alone.
export function EstimateSuggestion({
  taskId,
  projectId,
  suggestion,
  canApply,
  canDismiss,
}: EstimateSuggestionProps) {
  const { t } = useTranslation();
  const label = estimateText(suggestion, t);

  return (
    <SuggestionRow
      icon={
        <Timer aria-hidden="true" className="size-3.5 text-muted-foreground" />
      }
      label={label}
      reason={suggestion.reason}
      actions={
        <SuggestionActions
          taskId={taskId}
          projectId={projectId}
          suggestionId={suggestion.id}
          label={label}
          canApply={canApply}
          canDismiss={canDismiss}
        />
      }
    >
      <p className="text-sm">{estimatePlanText(suggestion, t)}</p>
    </SuggestionRow>
  );
}
