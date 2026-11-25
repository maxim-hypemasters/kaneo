import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import type { TestCase, UpdateTestCaseInput } from "@/fetchers/test-case/types";
import { useUpdateTestCase } from "@/hooks/mutations/test-case/use-update-test-case";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";
import { TestCaseComments } from "./comments/test-case-comments";
import { TestCaseDocumentField } from "./test-case-document-field";
import { TestCaseProperties } from "./test-case-properties";

const TEXT_FIELDS = [
  {
    field: "description",
    label: "tasks:testCases.fields.description",
    placeholder: "tasks:testCases.placeholders.description",
  },
  {
    field: "steps",
    label: "tasks:testCases.fields.steps",
    placeholder: "tasks:testCases.placeholders.steps",
  },
  {
    field: "expectedResult",
    label: "tasks:testCases.fields.expectedResult",
    placeholder: "tasks:testCases.placeholders.expectedResult",
  },
] as const;

// A reading column; from `lg` it sits left of the properties rail.
const column =
  "w-full min-w-0 max-w-3xl justify-self-center lg:col-start-1 lg:px-9";

// Stacked on a phone: title, properties, texts. From `lg` the properties move
// to a rail on the right, as on a task.
export function TestCaseDetails({
  testCase,
  projectId,
  workspaceId,
}: {
  testCase: TestCase;
  projectId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const { canUpdateTestCases } = useWorkspacePermission();
  const update = useUpdateTestCase(projectId);
  // Text fields report their own save errors beside their editor.
  const updateText = useUpdateTestCase(projectId);
  const [title, setTitle] = useState(testCase.title);
  const readOnly = !canUpdateTestCases();
  const save = (input: UpdateTestCaseInput) =>
    update.mutate({ id: testCase.id, input });
  return (
    <div className="grid min-h-full grid-cols-1 content-start gap-y-5 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_18.25rem] lg:grid-rows-[auto_1fr] lg:p-0">
      <label
        className={cn(
          column,
          "flex flex-col gap-1.5 text-sm lg:row-start-1 lg:pt-7",
        )}
      >
        {t("tasks:testCases.fields.title")}
        <Input
          type="text"
          required
          maxLength={255}
          disabled={readOnly}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => {
            const next = title.trim();
            if (!next) setTitle(testCase.title);
            else if (next !== testCase.title) save({ title: next });
          }}
        />
      </label>
      <aside
        aria-label={t("tasks:properties.title")}
        className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l"
      >
        <div className="lg:sticky lg:top-0 lg:px-3 lg:pt-4 lg:pb-6">
          <TestCaseProperties
            testCase={testCase}
            projectId={projectId}
            workspaceId={workspaceId}
            readOnly={readOnly}
            onSave={save}
          />
        </div>
      </aside>
      <div
        className={cn(column, "flex flex-col gap-5 lg:row-start-2 lg:pb-10")}
      >
        {TEXT_FIELDS.map(({ field, label, placeholder }) => (
          <TestCaseDocumentField
            key={field}
            documentKey={`${testCase.id}:${field}`}
            label={t(label)}
            placeholder={t(placeholder)}
            value={testCase[field]}
            canEdit={!readOnly}
            onSave={(value) =>
              updateText.mutateAsync({
                id: testCase.id,
                input: { [field]: value },
              })
            }
          />
        ))}
        {update.isError && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {update.error.message || t("tasks:testCases.saveError")}
          </p>
        )}
        <TestCaseComments
          testCaseId={testCase.id}
          projectId={projectId}
          className="mt-3 border-t pt-6"
        />
      </div>
    </div>
  );
}
