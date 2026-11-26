import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { AgentQuestion } from "@/fetchers/agent/get-task-agent";
import { type AnswerSelection, OTHER_CHOICE } from "./answer-selection";

const chipClassName =
  "max-w-full cursor-pointer items-start rounded-lg border border-border bg-background px-2.5 py-1.5 font-normal has-data-checked:border-primary/60 has-data-checked:bg-primary/6 has-data-disabled:cursor-default";

type ClarifyQuestionProps = {
  question: AgentQuestion;
  selection: AnswerSelection | undefined;
  onChange: (selection: AnswerSelection) => void;
  readOnly: boolean;
  disabled?: boolean;
};

export function ClarifyQuestion({
  question,
  selection,
  onChange,
  readOnly,
  disabled = false,
}: ClarifyQuestionProps) {
  const { t } = useTranslation();
  const textId = useId();
  const choice = selection?.choice ?? "";
  const other = selection?.other ?? "";
  // Options are ordered with the agent's recommendation first.
  const options = question.options.map((text, index) => ({
    text,
    value: String(index),
    recommended: index === 0,
  }));

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background/60 p-3">
      <p id={textId} className="text-sm font-medium">
        {question.text}
        {question.blocking ? (
          <Badge variant="warning" className="ms-2 align-middle">
            {t("tasks:aiAgent.questions.blocking")}
          </Badge>
        ) : null}
      </p>
      {readOnly ? (
        <ul className="space-y-1 text-muted-foreground text-sm">
          {options.map((option) => (
            <li key={option.value}>
              {option.text}
              {option.recommended ? (
                <Badge variant="info" className="ms-2 align-middle">
                  {t("tasks:aiAgent.questions.recommended")}
                </Badge>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <RadioGroup
            aria-labelledby={textId}
            value={choice}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({ choice: String(value), other })
            }
            className="flex flex-wrap gap-2"
          >
            {options.map((option) => (
              <Label key={option.value} className={chipClassName}>
                <Radio value={option.value} className="mt-px" />
                <span className="min-w-0">
                  {option.text}
                  {option.recommended ? (
                    <Badge variant="info" className="ms-2 align-middle">
                      {t("tasks:aiAgent.questions.recommended")}
                    </Badge>
                  ) : null}
                </span>
              </Label>
            ))}
            <Label className={chipClassName}>
              <Radio value={OTHER_CHOICE} className="mt-px" />
              <span>{t("tasks:aiAgent.questions.other")}</span>
            </Label>
          </RadioGroup>
          {choice === OTHER_CHOICE ? (
            <Textarea
              aria-label={t("tasks:aiAgent.questions.otherLabel")}
              placeholder={t("tasks:aiAgent.questions.otherPlaceholder")}
              value={other}
              disabled={disabled}
              maxLength={2000}
              rows={2}
              size="sm"
              onChange={(event) =>
                onChange({ choice, other: event.target.value })
              }
            />
          ) : null}
        </>
      )}
    </div>
  );
}
