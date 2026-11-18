import { Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TestCase, UpdateTestCaseInput } from "@/fetchers/test-case/types";
import { useUpdateTestCase } from "@/hooks/mutations/test-case/use-update-test-case";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { openMilestoneDetails } from "@/store/milestone-details";
import { DeleteTestCaseDialog } from "./delete-test-case-dialog";
import { TestCaseBugSelect } from "./test-case-bug-select";
import { TestCaseMilestoneSelect } from "./test-case-milestone-select";
import { TestCaseStatusSelect } from "./test-case-status-select";
import { TestCaseTextField } from "./test-case-text-field";

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
  const { canUpdateTestCases, canDeleteTestCases, canReadMilestones } =
    useWorkspacePermission();
  const update = useUpdateTestCase(projectId);
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
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5 text-sm">
          {t("tasks:testCases.fields.status")}
          <TestCaseStatusSelect
            value={testCase.status}
            disabled={readOnly}
            onChange={(status) => save({ status })}
          />
        </div>
        {canReadMilestones() && (
          <div className="flex min-w-0 flex-col gap-1.5 text-sm">
            {t("tasks:testCases.fields.milestone")}
            <TestCaseMilestoneSelect
              projectId={projectId}
              value={testCase.milestoneId}
              disabled={readOnly}
              onChange={(milestoneId) => save({ milestoneId })}
            />
            {testCase.milestone && (
              <Button
                variant="link"
                size="sm"
                className="h-auto justify-start p-0"
                onClick={() =>
                  openMilestoneDetails(projectId, testCase.milestone!.id)
                }
              >
                {t("tasks:testCases.openMilestone")}
              </Button>
            )}
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1.5 text-sm">
          {t("tasks:testCases.fields.bug")}
          <TestCaseBugSelect
            projectId={projectId}
            value={testCase.bugId}
            currentTitle={testCase.bug?.title}
            disabled={readOnly}
            onChange={(bugId) => save({ bugId })}
          />
          {testCase.bug && (
            <Link
              className="text-sm text-primary underline-offset-4 hover:underline"
              to="/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId"
              params={{ workspaceId, projectId, taskId: testCase.bug.id }}
            >
              {t("tasks:testCases.openBug")}
            </Link>
          )}
        </div>
      </div>
      <TestCaseTextField
        label={t("tasks:testCases.fields.description")}
        value={testCase.description}
        disabled={readOnly}
        rows={3}
        onSave={(description) => save({ description })}
      />
      <TestCaseTextField
        label={t("tasks:testCases.fields.steps")}
        value={testCase.steps}
        disabled={readOnly}
        rows={6}
        onSave={(steps) => save({ steps })}
      />
      <TestCaseTextField
        label={t("tasks:testCases.fields.expectedResult")}
        value={testCase.expectedResult}
        disabled={readOnly}
        rows={3}
        onSave={(expectedResult) => save({ expectedResult })}
      />
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
