import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { AgentQuestion } from "@/fetchers/agent/get-task-agent";
import { useSubmitTaskAgentAnswers } from "@/hooks/mutations/agent/use-submit-task-agent-answers";
import { type AnswerSelections, buildAnswers } from "./answer-selection";
import { ClarifyQuestion } from "./clarify-question";

type ClarifyQuestionsProps = {
  taskId: string;
  questions: AgentQuestion[];
  canUpdate: boolean;
};

// All answered questions go in one request, so Hermes reassesses once. The
// card around it carries the heading.
export function ClarifyQuestions({
  taskId,
  questions,
  canUpdate,
}: ClarifyQuestionsProps) {
  const { t } = useTranslation();
  const [selections, setSelections] = useState<AnswerSelections>({});
  const { mutate, isPending } = useSubmitTaskAgentAnswers();
  const answers = buildAnswers(questions, selections);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (answers.length === 0 || isPending) return;
    mutate(
      { taskId, answers },
      {
        onSuccess: () =>
          setSelections((current) => {
            const next = { ...current };
            for (const answer of answers) delete next[answer.questionId];
            return next;
          }),
      },
    );
  };

  const list = questions.map((question) => (
    <ClarifyQuestion
      key={question.id}
      question={question}
      selection={selections[question.id]}
      readOnly={!canUpdate}
      disabled={isPending}
      onChange={(selection) =>
        setSelections((current) => ({ ...current, [question.id]: selection }))
      }
    />
  ));

  if (!canUpdate) return <div className="space-y-2">{list}</div>;

  return (
    <form noValidate onSubmit={submit} className="space-y-2">
      {list}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-muted-foreground text-xs tabular-nums">
          {t("tasks:aiAgent.questions.answered", {
            answered: answers.length,
            total: questions.length,
          })}
        </span>
        <Button
          type="submit"
          size="sm"
          loading={isPending}
          disabled={answers.length === 0}
        >
          {t("tasks:aiAgent.questions.submit")}
        </Button>
      </div>
    </form>
  );
}
