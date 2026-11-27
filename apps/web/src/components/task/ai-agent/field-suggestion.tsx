import { Diamond, Layers, Rocket, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getPriorityIcon } from "@/lib/priority";
import { SuggestionActions } from "./suggestion-actions";
import { SuggestionRow } from "./suggestion-row";
import { fieldSuggestionText } from "./suggestion-text";
import type { AgentFieldSuggestion } from "./suggestion-types";

const ICONS = {
  assignee: UserRound,
  feature: Layers,
  milestone: Diamond,
  release: Rocket,
};

type FieldSuggestionProps = {
  taskId: string;
  projectId: string;
  suggestion: AgentFieldSuggestion;
  canApply: boolean;
  canDismiss: boolean;
};

// A value for one empty field: assignee, priority, feature (with its
// milestone), milestone or release.
export function FieldSuggestion({
  taskId,
  projectId,
  suggestion,
  canApply,
  canDismiss,
}: FieldSuggestionProps) {
  const { t } = useTranslation();
  const label = fieldSuggestionText(suggestion, t);
  // Priority shows the same glyph as the task's Priority field.
  let icon: ReactNode;
  if (suggestion.kind === "priority") {
    icon = getPriorityIcon(suggestion.priority);
  } else {
    const Icon = ICONS[suggestion.kind];
    icon = (
      <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
    );
  }

  return (
    <SuggestionRow
      icon={icon}
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
    />
  );
}
