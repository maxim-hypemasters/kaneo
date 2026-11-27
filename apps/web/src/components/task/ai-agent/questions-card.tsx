import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { RailCard } from "@/components/common/rail-card";
import type {
  AgentClarification,
  AgentQuestion,
} from "@/fetchers/agent/get-task-agent";
import { ClarifyQuestions } from "./clarify-questions";
import { DecisionsList } from "./decisions-list";
import { useFocusRescue } from "./use-focus-rescue";

type QuestionsCardProps = {
  taskId: string;
  questions: AgentQuestion[];
  /** Tells apart the questions of each assessment. */
  assessedAt: string | null;
  clarifications: AgentClarification[];
  canUpdate: boolean;
};

export function QuestionsCard({
  taskId,
  questions,
  assessedAt,
  clarifications,
  canUpdate,
}: QuestionsCardProps) {
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLDivElement>(null);
  useFocusRescue(bodyRef);

  return (
    <RailCard
      title={t("tasks:aiAgent.questions.title")}
      count={questions.length}
    >
      <div
        ref={bodyRef}
        tabIndex={-1}
        className="space-y-3 rounded-lg px-2 pt-1 pb-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {questions.length > 0 ? (
          <ClarifyQuestions
            // A new assessment brings new questions and fresh choices.
            key={assessedAt}
            taskId={taskId}
            questions={questions}
            canUpdate={canUpdate}
          />
        ) : null}
        {clarifications.length > 0 ? (
          <DecisionsList clarifications={clarifications} />
        ) : null}
      </div>
    </RailCard>
  );
}
