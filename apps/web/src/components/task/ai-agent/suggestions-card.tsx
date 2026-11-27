import { type RefObject, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { RailCard } from "@/components/common/rail-card";
import type { AgentSuggestion } from "@/fetchers/agent/get-task-agent";
import {
  canApplySuggestion,
  type SuggestionPermissions,
} from "./can-apply-suggestion";
import { DescriptionSuggestion } from "./description-suggestion";
import { EstimateSuggestion } from "./estimate-suggestion";
import { FieldSuggestion } from "./field-suggestion";
import { orderSuggestions } from "./suggestion-order";
import { TestCasesSuggestion } from "./test-cases-suggestion";
import { useSuggestionFocus } from "./use-suggestion-focus";

type SuggestionsCardProps = {
  taskId: string;
  projectId: string;
  suggestions: AgentSuggestion[];
  permissions: SuggestionPermissions;
  /** Takes focus when the last suggestion goes and the card with it. */
  emptyFocusRef: RefObject<HTMLElement | null>;
};

// Shown at every stage: what a suggestion adds stays useful after work
// starts. Field values come first, then test cases, then additions to the
// description.
export function SuggestionsCard({
  taskId,
  projectId,
  suggestions,
  permissions,
  emptyFocusRef,
}: SuggestionsCardProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLUListElement>(null);
  const rows = useMemo(() => orderSuggestions(suggestions), [suggestions]);
  const rowIds = useMemo(() => rows.map(({ id }) => id), [rows]);
  useSuggestionFocus(listRef, rowIds, emptyFocusRef);
  if (rows.length === 0) return null;

  const row = (suggestion: AgentSuggestion) => {
    const props = {
      taskId,
      projectId,
      canApply: canApplySuggestion(suggestion.kind, permissions),
      canDismiss: permissions.canUpdate,
    };
    switch (suggestion.kind) {
      case "description":
        return (
          <DescriptionSuggestion
            key={suggestion.id}
            taskId={taskId}
            suggestion={suggestion}
            canUpdate={permissions.canUpdate}
          />
        );
      case "estimate":
        return (
          <EstimateSuggestion
            key={suggestion.id}
            {...props}
            suggestion={suggestion}
          />
        );
      case "test_cases":
        return (
          <TestCasesSuggestion
            key={suggestion.id}
            {...props}
            suggestion={suggestion}
          />
        );
      default:
        return (
          <FieldSuggestion
            key={suggestion.id}
            {...props}
            suggestion={suggestion}
          />
        );
    }
  };

  return (
    <RailCard title={t("tasks:aiAgent.suggestions.title")} count={rows.length}>
      <ul
        ref={listRef}
        tabIndex={-1}
        className="space-y-2 rounded-lg px-0.5 pt-1 pb-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {rows.map(row)}
      </ul>
    </RailCard>
  );
}
