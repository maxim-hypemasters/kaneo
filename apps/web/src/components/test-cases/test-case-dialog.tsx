import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { TestCaseStatus } from "@/fetchers/test-case/types";
import { useCreateTestCase } from "@/hooks/mutations/test-case/use-create-test-case";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { TestCaseBugSelect } from "./test-case-bug-select";
import { TestCaseMilestoneSelect } from "./test-case-milestone-select";
import { TestCaseStatusSelect } from "./test-case-status-select";
import { TestCaseTextInput } from "./test-case-text-input";

const optional = (value: string) => (value.trim() ? value : null);

export function TestCaseDialog({
  projectId,
  initialMilestoneId = null,
  initialBugId = null,
  onClose,
}: {
  projectId: string;
  initialMilestoneId?: string | null;
  initialBugId?: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { canReadMilestones } = useWorkspacePermission();
  const create = useCreateTestCase(projectId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [status, setStatus] = useState<TestCaseStatus>("not_run");
  const [milestoneId, setMilestoneId] = useState(initialMilestoneId);
  const [bugId, setBugId] = useState(initialBugId);
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending;
  const valid = title.trim().length > 0 && title.trim().length <= 255;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogPopup showCloseButton={!pending}>
        <form
          className="contents"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!valid || pending) return;
            setError(null);
            try {
              await create.mutateAsync({
                title: title.trim(),
                description: optional(description),
                steps: optional(steps),
                expectedResult: optional(expectedResult),
                status,
                milestoneId,
                bugId,
              });
              onClose();
            } catch (cause) {
              setError(
                cause instanceof Error && cause.message
                  ? cause.message
                  : t("tasks:testCases.saveError"),
              );
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("tasks:testCases.add")}</DialogTitle>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              {t("tasks:testCases.fields.title")}
              <Input
                type="text"
                autoFocus
                required
                maxLength={255}
                disabled={pending}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <TestCaseTextInput
              label={t("tasks:testCases.fields.description")}
              value={description}
              onChange={setDescription}
              disabled={pending}
              rows={2}
            />
            <TestCaseTextInput
              label={t("tasks:testCases.fields.steps")}
              value={steps}
              onChange={setSteps}
              disabled={pending}
              rows={4}
            />
            <TestCaseTextInput
              label={t("tasks:testCases.fields.expectedResult")}
              value={expectedResult}
              onChange={setExpectedResult}
              disabled={pending}
              rows={2}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5 text-sm">
                {t("tasks:testCases.fields.status")}
                <TestCaseStatusSelect
                  value={status}
                  onChange={setStatus}
                  disabled={pending}
                />
              </div>
              {canReadMilestones() && (
                <div className="flex min-w-0 flex-col gap-1.5 text-sm">
                  {t("tasks:testCases.fields.milestone")}
                  <TestCaseMilestoneSelect
                    projectId={projectId}
                    value={milestoneId}
                    onChange={setMilestoneId}
                    disabled={pending}
                  />
                </div>
              )}
              <div className="flex min-w-0 flex-col gap-1.5 text-sm">
                {t("tasks:testCases.fields.bug")}
                <TestCaseBugSelect
                  projectId={projectId}
                  value={bugId}
                  onChange={setBugId}
                  disabled={pending}
                />
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {error}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!valid || pending}
              aria-busy={pending}
            >
              {t("tasks:testCases.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
