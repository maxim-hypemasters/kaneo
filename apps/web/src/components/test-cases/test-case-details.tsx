import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TestCase, UpdateTestCaseInput } from "@/fetchers/test-case/types";
import { useUpdateTestCase } from "@/hooks/mutations/test-case/use-update-test-case";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { DeleteTestCaseDialog } from "./delete-test-case-dialog";
import { TestCaseProperties } from "./test-case-properties";
import { TestCaseDocumentField } from "./test-case-document-field";

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

export function TestCaseDetails({
  testCase,
  projectId,
  workspaceId,
  onDeleted,
}: {
  testCase: TestCase;
  projectId: string;
  workspaceId: string;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const { canUpdateTestCases, canDeleteTestCases } = useWorkspacePermission();
  const update = useUpdateTestCase(projectId);
  // Text fields report their own save errors beside their editor.
  const updateText = useUpdateTestCase(projectId);
  const [title, setTitle] = useState(testCase.title);
  const [deleting, setDeleting] = useState(false);
  const readOnly = !canUpdateTestCases();
  const save = (input: UpdateTestCaseInput) =>
    update.mutate({ id: testCase.id, input });
  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5 text-sm">
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
      <TestCaseProperties
        testCase={testCase}
        projectId={projectId}
        workspaceId={workspaceId}
        readOnly={readOnly}
        onSave={save}
      />
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
      {canDeleteTestCases() && (
        <div>
          <Button variant="outline" size="sm" onClick={() => setDeleting(true)}>
            <Trash2 aria-hidden="true" />
            {t("tasks:testCases.delete")}
          </Button>
          <DeleteTestCaseDialog
            projectId={projectId}
            testCaseId={testCase.id}
            open={deleting}
            onOpenChange={setDeleting}
            onDeleted={onDeleted}
          />
        </div>
      )}
    </div>
  );
}
