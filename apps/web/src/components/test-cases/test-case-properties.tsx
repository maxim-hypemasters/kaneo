import { Link, useParams } from "@tanstack/react-router";
import { ArrowUpRight, Bug, Diamond } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PropertyRow } from "@/components/task/properties/property-row";
import { PropertyValue } from "@/components/task/properties/property-value";
import type { TestCase, UpdateTestCaseInput } from "@/fetchers/test-case/types";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import {
  openMilestoneDetails,
  useMilestoneDetailsStore,
} from "@/store/milestone-details";
import { bugLabel } from "./bug-label";
import type { LinkChoice } from "./link-choice";
import { TestCaseBugMenu } from "./test-case-bug-menu";
import { TestCaseMilestoneMenu } from "./test-case-milestone-menu";
import { TestCasePicker } from "./test-case-picker";
import { TestCaseResultMenu } from "./test-case-result-menu";
import { TEST_CASE_STATUS_LABELS } from "./test-case-status";
import { TestCaseStatusIcon } from "./test-case-status-icon";

const openClass =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-3.5";

// Result, Milestone and Bug of an open test case, each with the project's
// option menu.
export function TestCaseProperties({
  testCase,
  projectId,
  workspaceId,
  readOnly,
  onSave,
}: {
  testCase: TestCase;
  projectId: string;
  workspaceId: string;
  readOnly: boolean;
  onSave: (input: UpdateTestCaseInput) => void;
}) {
  const { t } = useTranslation();
  const { canReadMilestones } = useWorkspacePermission();
  // The test case covers the page, so a link to what is already open behind
  // it would do nothing visible.
  const { taskId: pageTaskId } = useParams({ strict: false });
  const milestoneOpenBehind = useMilestoneDetailsStore(
    (state) => state.milestoneId !== null,
  );
  const milestone: LinkChoice = testCase.milestoneId
    ? {
        id: testCase.milestoneId,
        label:
          testCase.milestone?.title ?? t("tasks:testCases.hiddenMilestone"),
      }
    : null;
  const bug: LinkChoice = testCase.bugId
    ? {
        id: testCase.bugId,
        label: testCase.bug
          ? bugLabel(testCase.bug)
          : t("tasks:testCases.hiddenBug"),
      }
    : null;
  return (
    <div className="flex flex-col gap-0.5">
      <PropertyRow label={t("tasks:testCases.fields.status")}>
        <TestCasePicker
          disabled={readOnly}
          width="w-60"
          trigger={
            <PropertyValue disabled={readOnly}>
              <TestCaseStatusIcon status={testCase.status} />
              <span className="truncate">
                {t(TEST_CASE_STATUS_LABELS[testCase.status])}
              </span>
            </PropertyValue>
          }
        >
          {(close) => (
            <TestCaseResultMenu
              value={testCase.status}
              onSelect={(status) => {
                close();
                if (status !== testCase.status) onSave({ status });
              }}
            />
          )}
        </TestCasePicker>
      </PropertyRow>
      {canReadMilestones() && (
        <PropertyRow label={t("tasks:testCases.fields.milestone")}>
          <TestCasePicker
            disabled={readOnly}
            trigger={
              <PropertyValue disabled={readOnly}>
                <Diamond aria-hidden="true" className="text-muted-foreground" />
                <span className="truncate">
                  {milestone?.label ?? t("tasks:testCases.noMilestone")}
                </span>
              </PropertyValue>
            }
          >
            {(close) => (
              <TestCaseMilestoneMenu
                projectId={projectId}
                value={milestone}
                onSelect={(choice) => {
                  close();
                  const milestoneId = choice?.id ?? null;
                  if (milestoneId !== testCase.milestoneId)
                    onSave({ milestoneId });
                }}
              />
            )}
          </TestCasePicker>
          {testCase.milestone && !milestoneOpenBehind && (
            <button
              type="button"
              className={openClass}
              aria-label={t("tasks:testCases.openMilestone")}
              onClick={() =>
                openMilestoneDetails(projectId, testCase.milestone!.id)
              }
            >
              <ArrowUpRight aria-hidden="true" />
            </button>
          )}
        </PropertyRow>
      )}
      <PropertyRow label={t("tasks:testCases.fields.bug")}>
        <TestCasePicker
          disabled={readOnly}
          trigger={
            <PropertyValue disabled={readOnly}>
              <Bug aria-hidden="true" className="text-muted-foreground" />
              <span className="truncate">
                {bug?.label ?? t("tasks:testCases.noBug")}
              </span>
            </PropertyValue>
          }
        >
          {(close) => (
            <TestCaseBugMenu
              projectId={projectId}
              value={bug}
              onSelect={(choice) => {
                close();
                const bugId = choice?.id ?? null;
                if (bugId !== testCase.bugId) onSave({ bugId });
              }}
            />
          )}
        </TestCasePicker>
        {testCase.bug && testCase.bug.id !== pageTaskId && (
          <Link
            className={openClass}
            aria-label={t("tasks:testCases.openBug")}
            to="/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId"
            params={{ workspaceId, projectId, taskId: testCase.bug.id }}
          >
            <ArrowUpRight aria-hidden="true" />
          </Link>
        )}
      </PropertyRow>
    </div>
  );
}
