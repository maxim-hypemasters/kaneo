import { FilePlusIcon } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { AgentDescriptionSuggestion } from "@/fetchers/agent/get-task-agent";
import { SuggestionActions } from "./suggestion-actions";

type DescriptionSuggestionProps = {
  taskId: string;
  suggestion: AgentDescriptionSuggestion;
  canUpdate: boolean;
};

// Markdown Hermes suggests adding to the description.
export function DescriptionSuggestion({
  taskId,
  suggestion,
  canUpdate,
}: DescriptionSuggestionProps) {
  const { t } = useTranslation();
  const titleId = useId();

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
      {/* A description shows only on the task, so Apply needs no project. */}
      <SuggestionActions
        taskId={taskId}
        suggestionId={suggestion.id}
        label={suggestion.title}
        canApply={canUpdate}
        canDismiss={canUpdate}
        applyAs={{
          text: t("tasks:aiAgent.suggestions.apply"),
          icon: FilePlusIcon,
          titleId,
        }}
      />
    </li>
  );
}
