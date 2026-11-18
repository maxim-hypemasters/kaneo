import { Bug, Diamond } from "lucide-react";
import { useTranslation } from "react-i18next";
import { chipClass } from "@/components/shared/modals/create-task/chip-class";
import type { TestCaseStatus } from "@/fetchers/test-case/types";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import type { LinkChoice } from "./link-choice";
import { TestCaseBugMenu } from "./test-case-bug-menu";
import { TestCaseMilestoneMenu } from "./test-case-milestone-menu";
import { TestCasePicker } from "./test-case-picker";
import { TestCaseResultMenu } from "./test-case-result-menu";
import { TEST_CASE_STATUS_LABELS } from "./test-case-status";
import { TestCaseStatusIcon } from "./test-case-status-icon";

type Choices = {
  status: TestCaseStatus;
  milestone: LinkChoice;
  bug: LinkChoice;
};

// The create dialog's Result, Milestone and Bug chips.
export function TestCasePickerChips({
  projectId,
  value,
  onChange,
  disabled,
}: {
  projectId: string;
  value: Choices;
  onChange: (value: Choices) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { canReadMilestones } = useWorkspacePermission();
  const chipLabel = (field: string, label: string | null) =>
    label === null ? (
      <span>{field}</span>
    ) : (
      <>
        <span className="sr-only">{field}: </span>
        <span className="max-w-48 truncate">{label}</span>
      </>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TestCasePicker
        disabled={disabled}
        width="w-60"
        trigger={
          <button type="button" className={chipClass(true)} disabled={disabled}>
            <TestCaseStatusIcon status={value.status} />
            {chipLabel(
              t("tasks:testCases.fields.status"),
              t(TEST_CASE_STATUS_LABELS[value.status]),
            )}
          </button>
        }
      >
        {(close) => (
          <TestCaseResultMenu
            value={value.status}
            onSelect={(status) => {
              onChange({ ...value, status });
              close();
            }}
          />
        )}
      </TestCasePicker>
      {canReadMilestones() && (
        <TestCasePicker
          disabled={disabled}
          trigger={
            <button
              type="button"
              className={chipClass(value.milestone !== null)}
              disabled={disabled}
            >
              <Diamond aria-hidden="true" className="size-3.5" />
              {chipLabel(
                t("tasks:testCases.fields.milestone"),
                value.milestone?.label ?? null,
              )}
            </button>
          }
        >
          {(close) => (
            <TestCaseMilestoneMenu
              projectId={projectId}
              value={value.milestone}
              onSelect={(milestone) => {
                onChange({ ...value, milestone });
                close();
              }}
            />
          )}
        </TestCasePicker>
      )}
      <TestCasePicker
        disabled={disabled}
        trigger={
          <button
            type="button"
            className={chipClass(value.bug !== null)}
            disabled={disabled}
          >
            <Bug aria-hidden="true" className="size-3.5" />
            {chipLabel(
              t("tasks:testCases.fields.bug"),
              value.bug?.label ?? null,
            )}
          </button>
        }
      >
        {(close) => (
          <TestCaseBugMenu
            projectId={projectId}
            value={value.bug}
            onSelect={(bug) => {
              onChange({ ...value, bug });
              close();
            }}
          />
        )}
      </TestCasePicker>
    </div>
  );
}
