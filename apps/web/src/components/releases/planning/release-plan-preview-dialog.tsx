import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Release } from "@/types/release";
import { hasCodeFreezeConflicts } from "./release-plan-changes";
import { ReleasePlanDiscardDialog } from "./release-plan-discard-dialog";
import { ReleasePlanPreviewContent } from "./release-plan-preview-content";
import type { useReleasePlan } from "./use-release-plan";

export function ReleasePlanPreviewDialog({
  open,
  onOpenChange,
  disabled,
  projectId,
  workspaceId,
  release,
  planner,
  canPlan,
  inputsIncomplete,
  showTrigger = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  projectId: string;
  workspaceId: string;
  release: Release;
  planner: ReturnType<typeof useReleasePlan>;
  canPlan: boolean;
  inputsIncomplete: boolean;
  showTrigger?: boolean;
}) {
  const { t } = useTranslation();
  const { preview, calculate, apply, query, stale, applied } = planner;
  const [discardOpen, setDiscardOpen] = useState(false);
  const conflicts = hasCodeFreezeConflicts(preview);
  const pending = calculate.isPending || apply.isPending;
  const error =
    calculate.error ?? apply.error ?? (query.isError ? query.error : null);
  const refresh = () => {
    if (pending || planner.inputSaving || inputsIncomplete || !canPlan) return;
    apply.reset();
    calculate.mutate();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && (apply.isPending || planner.inputSaving)) return;
        if (!next && planner.hasChanges) {
          setDiscardOpen(true);
          return;
        }
        onOpenChange(next);
      }}
    >
      {showTrigger && (
        <DialogTrigger disabled={disabled} render={<Button type="button" />}>
          {t("tasks:releases.planning.preview")}
        </DialogTrigger>
      )}
      <DialogPopup
        fullscreen
        showCloseButton={!apply.isPending && !planner.inputSaving}
      >
        <DialogHeader className="max-sm:p-4">
          <DialogTitle className="break-words pr-8">
            {t("tasks:releases.planning.previewTitle", {
              release: release.name,
            })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("tasks:releases.planning.previewDescription")}
          </DialogDescription>
          {error && (
            <Alert variant="error">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>{t("tasks:releases.planning.error")}</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
          {stale && (
            <Alert variant="warning">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>
                {t("tasks:scheduling.stalePreview")}
              </AlertDescription>
            </Alert>
          )}
          {inputsIncomplete && (
            <p role="status" className="text-sm text-muted-foreground">
              {t("tasks:releases.planning.inputsRequired")}
            </p>
          )}
          {conflicts && (
            <p role="status" className="text-sm text-destructive-foreground">
              {t("tasks:releases.planning.resolution.applyBlocked")}
            </p>
          )}
          {applied && (
            <Alert variant="success">
              <CheckCircle2 aria-hidden="true" />
              <AlertTitle>{t("tasks:releases.planning.applied")}</AlertTitle>
              <AlertDescription>
                {t("tasks:releases.planning.appliedDescription")}
              </AlertDescription>
            </Alert>
          )}
          {(error || stale) && (
            <div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={
                  pending || planner.inputSaving || inputsIncomplete || !canPlan
                }
                onClick={refresh}
              >
                {t("tasks:releases.planning.refreshPreview")}
              </Button>
            </div>
          )}
          {pending && (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              {t(
                apply.isPending
                  ? "tasks:scheduling.applying"
                  : "tasks:scheduling.calculating",
              )}
            </p>
          )}
        </DialogHeader>
        {preview ? (
          <ReleasePlanPreviewContent
            open={open}
            projectId={projectId}
            workspaceId={workspaceId}
            release={release}
            preview={preview}
            planner={planner}
            canPlan={canPlan}
          />
        ) : (
          <div data-slot="dialog-panel" className="min-h-0 flex-1" />
        )}
        <DialogFooter className="sm:rounded-none">
          <Button
            type="button"
            disabled={
              pending ||
              planner.inputSaving ||
              inputsIncomplete ||
              conflicts ||
              !canPlan ||
              !preview ||
              stale ||
              query.isFetching ||
              query.isError ||
              applied ||
              (preview.tasks.length === 0 && !planner.hasChanges)
            }
            onClick={() => apply.mutate()}
          >
            {t(
              applied
                ? "tasks:releases.planning.appliedButton"
                : "tasks:scheduling.apply",
            )}
          </Button>
        </DialogFooter>
      </DialogPopup>
      <ReleasePlanDiscardDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onDiscard={() => {
          setDiscardOpen(false);
          onOpenChange(false);
        }}
      />
    </Dialog>
  );
}
