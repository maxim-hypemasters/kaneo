import { ChevronDownIcon, ClipboardCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/cn";
import { SuggestionActions } from "./suggestion-actions";
import { SuggestionRow } from "./suggestion-row";
import { TestCaseDraft } from "./test-case-draft";
import { testCasesText } from "./suggestion-text";
import type { AgentTestCasesSuggestion } from "./suggestion-types";

type TestCasesSuggestionProps = {
  taskId: string;
  projectId: string;
  suggestion: AgentTestCasesSuggestion;
  canApply: boolean;
  canDismiss: boolean;
};

// Test cases Apply creates, linked to the bug or to the task's milestone.
// The cases themselves sit behind a toggle to keep the card short.
export function TestCasesSuggestion({
  taskId,
  projectId,
  suggestion,
  canApply,
  canDismiss,
}: TestCasesSuggestionProps) {
  const { t } = useTranslation();
  const label = testCasesText(suggestion, t);

  return (
    <SuggestionRow
      icon={
        <ClipboardCheck
          aria-hidden="true"
          className="size-3.5 text-muted-foreground"
        />
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
      <Collapsible>
        <CollapsibleTrigger
          className={cn(
            buttonVariants({ variant: "ghost", size: "xs" }),
            "-ms-2 text-muted-foreground data-panel-open:[&_svg]:rotate-180",
          )}
        >
          {t("tasks:aiAgent.suggestions.showTestCases")}
          <ChevronDownIcon
            aria-hidden="true"
            className="transition-transform duration-150"
          />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <ol className="list-decimal space-y-2 ps-5 pt-1 text-sm">
            {suggestion.cases.map((testCase, index) => (
              // eslint-disable-next-line react/no-array-index-key -- Drafts have no ids and their order never changes; titles may repeat.
              <TestCaseDraft key={index} testCase={testCase} />
            ))}
          </ol>
        </CollapsiblePanel>
      </Collapsible>
    </SuggestionRow>
  );
}
