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
import type { LinkChoice } from "./link-choice";
import { TestCasePickerChips } from "./test-case-picker-chips";
import { TestCaseEditorInput } from "./test-case-editor-input";

const optional = (value: string) => (value.trim() ? value : null);

export function TestCaseDialog({
  projectId,
  initialMilestone = null,
  initialBug = null,
  onClose,
}: {
  projectId: string;
  initialMilestone?: LinkChoice;
  initialBug?: LinkChoice;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateTestCase(projectId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [choices, setChoices] = useState<{
    status: TestCaseStatus;
    milestone: LinkChoice;
    bug: LinkChoice;
  }>({ status: "not_run", milestone: initialMilestone, bug: initialBug });
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
                status: choices.status,
                milestoneId: choices.milestone?.id ?? null,
                bugId: choices.bug?.id ?? null,
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
            <TestCaseEditorInput
              label={t("tasks:testCases.fields.description")}
              placeholder={t("tasks:testCases.placeholders.description")}
              value={description}
              onChange={setDescription}
              disabled={pending}
            />
            <TestCaseEditorInput
              label={t("tasks:testCases.fields.steps")}
              placeholder={t("tasks:testCases.placeholders.steps")}
              value={steps}
              onChange={setSteps}
              disabled={pending}
            />
            <TestCaseEditorInput
              label={t("tasks:testCases.fields.expectedResult")}
              placeholder={t("tasks:testCases.placeholders.expectedResult")}
              value={expectedResult}
              onChange={setExpectedResult}
              disabled={pending}
            />
            <TestCasePickerChips
              projectId={projectId}
              value={choices}
              onChange={setChoices}
              disabled={pending}
            />
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
