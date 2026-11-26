import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TaskAgent } from "@/fetchers/agent/get-task-agent";
import { ClarifyChecklist } from "./clarify-checklist";
import { ClarifyQuestions } from "./clarify-questions";
import { ClarifySuggestion } from "./clarify-suggestion";
import { DecisionsList } from "./decisions-list";
import { listedShipBlockers, shipBlockerKey } from "./ship-blocker-key";
import { useFocusRescue } from "./use-focus-rescue";

const headingClassName =
  "font-medium text-muted-foreground text-xs uppercase tracking-wide";

type ClarifyPanelProps = {
  id: string;
  taskId: string;
  agent: TaskAgent;
  canUpdate: boolean;
};

export function ClarifyPanel({
  id,
  taskId,
  agent,
  canUpdate,
}: ClarifyPanelProps) {
  const { t } = useTranslation();
  const summaryId = useId();
  const suggestionsId = useId();
  const blockersId = useId();
  const { assessment, clarifications, ship } = agent;
  const blockers = ship.activeRun ? [] : listedShipBlockers(ship.blockers);
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusRescue(rootRef);

  return (
    <div
      ref={rootRef}
      id={id}
      role="region"
      aria-label={t("tasks:aiAgent.panelLabel")}
      tabIndex={-1}
      className="space-y-4 border-border border-t px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {assessment ? (
        <>
          <section aria-labelledby={summaryId} className="space-y-1">
            <h3 id={summaryId} className={headingClassName}>
              {t("tasks:aiAgent.summaryTitle")}
            </h3>
            <p className="whitespace-pre-wrap text-sm">{assessment.summary}</p>
          </section>
          {assessment.checklist.length > 0 ? (
            <ClarifyChecklist items={assessment.checklist} />
          ) : null}
          {assessment.questions.length > 0 ? (
            <ClarifyQuestions
              // A new assessment brings new questions and fresh choices.
              key={assessment.assessedAt}
              taskId={taskId}
              questions={assessment.questions}
              canUpdate={canUpdate}
            />
          ) : null}
          {assessment.suggestions.length > 0 ? (
            <section aria-labelledby={suggestionsId} className="space-y-2">
              <h3 id={suggestionsId} className={headingClassName}>
                {t("tasks:aiAgent.suggestions.title")}
              </h3>
              <ul className="space-y-2">
                {assessment.suggestions.map((suggestion) => (
                  <ClarifySuggestion
                    key={suggestion.id}
                    taskId={taskId}
                    suggestion={suggestion}
                    canUpdate={canUpdate}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
      {clarifications.length > 0 ? (
        <DecisionsList clarifications={clarifications} />
      ) : null}
      {blockers.length > 0 ? (
        <section aria-labelledby={blockersId} className="space-y-1">
          <h3 id={blockersId} className={headingClassName}>
            {t("tasks:aiAgent.blockers.title")}
          </h3>
          <ul className="list-disc space-y-0.5 ps-5 text-muted-foreground text-sm">
            {blockers.map((blocker) => (
              <li key={blocker}>{t(shipBlockerKey(blocker))}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
