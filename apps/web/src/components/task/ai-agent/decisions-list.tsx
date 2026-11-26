import { ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { AgentClarification } from "@/fetchers/agent/get-task-agent";

type DecisionsListProps = {
  clarifications: AgentClarification[];
};

// Answered questions, which Hermes works from alongside the task text.
export function DecisionsList({ clarifications }: DecisionsListProps) {
  const { t } = useTranslation();

  return (
    <Collapsible>
      <CollapsibleTrigger className="group inline-flex items-center gap-1 rounded-sm font-medium text-muted-foreground text-xs uppercase tracking-wide outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRightIcon
          aria-hidden="true"
          className="size-3.5 transition-transform duration-150 group-data-panel-open:rotate-90"
        />
        {t("tasks:aiAgent.decisions.title", { count: clarifications.length })}
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <ul className="mt-2 space-y-2">
          {clarifications.map((item) => (
            <li
              key={item.id}
              className="space-y-0.5 border-border border-s-2 ps-2.5 text-sm"
            >
              <p className="text-muted-foreground">{item.question}</p>
              <p className="whitespace-pre-wrap">{item.answer}</p>
              {item.answeredBy ? (
                <p className="text-muted-foreground text-xs">
                  {t("tasks:aiAgent.decisions.answeredBy", {
                    name: item.answeredBy.name,
                  })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </CollapsiblePanel>
    </Collapsible>
  );
}
