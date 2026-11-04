import { CalendarRange, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Release } from "@/types/release";
import { ReleasePlanPreviewDialog } from "./release-plan-preview-dialog";
import { ReleasePlanTaskRow } from "./release-plan-task-row";
import { useReleasePlan } from "./use-release-plan";

export function ReleasePlanDialog({
  projectId,
  workspaceId,
  release,
  canPlan = true,
}: {
  projectId: string;
  workspaceId: string;
  release: Release;
  canPlan?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const editorContext = `${projectId}:${release.id}`;
  const [editorSelection, setEditorSelection] = useState(() => ({
    context: editorContext,
    ids: new Set<string>(),
  }));
  const [entry, setEntry] = useState<"checking" | "editor" | "preview">(
    "checking",
  );
  const checkingEntry = useRef(false);
  const planner = useReleasePlan(projectId, release.id, open);
  const { query, tasks, remainingTasks } = planner;
  const tasksWithIssues = (remainingTasks ?? tasks).filter(
    (task) => !task.currentAssigneeId || (task.estimateSeconds ?? 0) <= 0,
  );
  const inputsIncomplete = tasksWithIssues.length > 0;
  const editorTasks = tasks.filter(
    (task) =>
      (editorSelection.context === editorContext &&
        editorSelection.ids.has(task.taskId)) ||
      !task.currentAssigneeId ||
      (task.estimateSeconds ?? 0) <= 0,
  );
  const writing = planner.inputSaving || planner.apply.isPending;
  const disabled = writing || planner.calculate.isPending || !canPlan;
  const previewDisabled =
    disabled ||
    inputsIncomplete ||
    !query.data ||
    query.isError ||
    query.isFetching;
  useEffect(() => {
    if (!open || entry !== "editor") return;
    setEditorSelection((previous) => {
      const ids =
        previous.context === editorContext ? previous.ids : new Set<string>();
      const added = tasksWithIssues.filter((task) => !ids.has(task.taskId));
      return added.length
        ? {
            context: editorContext,
            ids: new Set([...ids, ...added.map((task) => task.taskId)]),
          }
        : previous;
    });
  }, [open, entry, editorContext, tasksWithIssues]);
  useEffect(() => {
    if (
      !open ||
      !checkingEntry.current ||
      !query.data ||
      query.isPending ||
      query.isFetching ||
      query.isError ||
      disabled
    )
      return;
    checkingEntry.current = false;
    if (inputsIncomplete) {
      setEntry("editor");
      return;
    }
    setEntry("preview");
    setPreviewOpen(true);
    planner.apply.reset();
    planner.calculate.mutate();
  }, [
    open,
    query.data,
    query.isPending,
    query.isFetching,
    query.isError,
    disabled,
    inputsIncomplete,
    planner.apply,
    planner.calculate,
  ]);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (writing || (!next && previewOpen) || (next && !canPlan)) return;
        checkingEntry.current = next;
        if (next) {
          setEntry("checking");
          setEditorSelection({ context: editorContext, ids: new Set() });
        }
        setOpen(next);
        if (!next) planner.reset();
      }}
    >
      {canPlan && (
        <DialogTrigger
          render={<Button type="button" variant="outline" size="xs" />}
        >
          <CalendarRange aria-hidden="true" />
          {t("tasks:releases.planning.action")}
        </DialogTrigger>
      )}
      <DialogPopup showCloseButton={!writing} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("tasks:releases.planning.title", { release: release.name })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("tasks:releases.planning.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-4">
          {query.isError && (
            <Alert variant="error">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>{t("tasks:releases.planning.error")}</AlertTitle>
              <AlertDescription>{query.error.message}</AlertDescription>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={writing}
                onClick={() => void query.refetch()}
              >
                {t("common:error.tryAgain")}
              </Button>
            </Alert>
          )}
          {entry === "checking" && !query.isError && (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              {t("tasks:scheduling.loading")}
            </p>
          )}
          {entry === "editor" &&
            (editorTasks.length > 0 ? (
              <>
                <h3 className="text-sm font-medium">
                  {t("tasks:releases.planning.editorItems")}
                </h3>
                <ul
                  aria-label={t("tasks:releases.planning.editorItems")}
                  className="divide-y"
                >
                  {editorTasks.map((task) => (
                    <ReleasePlanTaskRow
                      key={task.taskId}
                      task={task}
                      projectId={projectId}
                      workspaceId={workspaceId}
                      disabled={disabled || query.isError}
                      onSavingChange={(saving) =>
                        planner.setInputSaving(task.taskId, saving)
                      }
                      onSaved={(patch) =>
                        planner.inputsSaved(task.taskId, patch)
                      }
                    />
                  ))}
                </ul>
              </>
            ) : (
              !query.isPending &&
              !query.isError && (
                <p
                  role="status"
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  {t("tasks:releases.planning.empty")}
                </p>
              )
            ))}
        </DialogPanel>
        <DialogFooter>
          <ReleasePlanPreviewDialog
            open={previewOpen}
            showTrigger={entry === "editor"}
            onOpenChange={(next) => {
              if (writing) return;
              if (next && previewDisabled) return;
              setPreviewOpen(next);
              if (next) {
                planner.apply.reset();
                planner.calculate.mutate();
              } else {
                planner.cancelCalculation();
                planner.discardChanges();
                if (entry === "preview") {
                  setOpen(false);
                  planner.reset();
                }
              }
            }}
            projectId={projectId}
            workspaceId={workspaceId}
            release={release}
            planner={planner}
            canPlan={canPlan}
            inputsIncomplete={inputsIncomplete}
            disabled={previewDisabled}
          />
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
