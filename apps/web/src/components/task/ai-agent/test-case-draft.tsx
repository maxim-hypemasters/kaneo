import { useTranslation } from "react-i18next";
import type { AgentTestCasesSuggestion } from "./suggestion-types";

type TestCaseDraftProps = {
  testCase: AgentTestCasesSuggestion["cases"][number];
};

// One test case a suggestion would create: its title, steps and expected
// result as Hermes wrote them.
export function TestCaseDraft({ testCase }: TestCaseDraftProps) {
  const { t } = useTranslation();
  const details = [
    { term: t("tasks:aiAgent.suggestions.steps"), text: testCase.steps },
    {
      term: t("tasks:aiAgent.suggestions.expectedResult"),
      text: testCase.expectedResult,
    },
  ];

  return (
    <li className="space-y-0.5">
      <p className="break-words">{testCase.title}</p>
      {details.map(({ term, text }) =>
        text ? (
          <p
            key={term}
            className="whitespace-pre-wrap break-words text-muted-foreground text-xs"
          >
            <span className="font-medium">{term}: </span>
            {text}
          </p>
        ) : null,
      )}
    </li>
  );
}
