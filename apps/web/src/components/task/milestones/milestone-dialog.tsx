import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogPanel,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMilestoneMutations } from "@/hooks/mutations/milestone/use-milestone-mutations";
import { HttpError } from "@/lib/http-error";
import { MilestoneTaskPicker } from "./milestone-task-picker";
import { MilestonePlanningFields } from "./milestone-planning-fields";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import type { MilestoneInput } from "@/fetchers/milestone/milestones";
import type { Milestone } from "@/fetchers/milestone/milestones";
export function MilestoneDialog({
  projectId,
  featureId,
  milestone,
  onClose,
}: {
  projectId: string;
  featureId: string;
  milestone?: Milestone;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(milestone?.title ?? "");
  const { data: workspace } = useActiveWorkspace();
  const [planning, setPlanning] = useState<MilestoneInput>({
    leadId: milestone?.leadId ?? null,
    status: milestone?.status,
    priority: milestone?.priority ?? "no-priority",
    releaseId: milestone?.releaseId ?? null,
    startDate: milestone?.startDate ?? null,
    endDate: milestone?.endDate ?? null,
  });
  const startDate = planning.startDate ?? "";
  const endDate = planning.endDate ?? "";
  const invalidRange = Boolean(startDate && endDate && startDate > endDate);
  const [error, setError] = useState<"save" | "selection" | null>(null);
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const [hasUnavailableTasks, setHasUnavailableTasks] = useState(false);
  const mutations = useMilestoneMutations(projectId, featureId);
  const pending = mutations.create.isPending || mutations.update.isPending;
  const valid =
    title.trim().length > 0 &&
    title.trim().length <= 255 &&
    !invalidRange &&
    !hasUnavailableTasks;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogPopup>
        <form
          className="contents"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid || pending) return;
            setError(null);
            const input = {
              ...planning,
              title: title.trim(),
            };
            try {
              if (milestone)
                await mutations.update.mutateAsync({
                  id: milestone.id,
                  ...input,
                });
              else
                await mutations.create.mutateAsync({
                  ...input,
                  ...(taskIds.length ? { taskIds } : {}),
                });
              onClose();
            } catch (error) {
              setError(
                !milestone &&
                  taskIds.length > 0 &&
                  error instanceof HttpError &&
                  error.status === 409
                  ? "selection"
                  : "save",
              );
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t(milestone ? "tasks:milestones.edit" : "tasks:milestones.add")}
            </DialogTitle>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              {t("tasks:milestones.titleLabel")}
              <Input
                autoFocus
                disabled={pending}
                required
                maxLength={255}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <MilestonePlanningFields
              projectId={projectId}
              workspaceId={workspace?.id ?? ""}
              milestone={{
                leadId: planning.leadId ?? null,
                status: planning.status ?? "",
                priority: planning.priority ?? "no-priority",
                releaseId: planning.releaseId ?? null,
                startDate,
                endDate,
              }}
              pending={pending}
              onChange={(value) =>
                setPlanning((current) => ({ ...current, ...value }))
              }
            />
            {invalidRange && (
              <p
                id="milestone-date-range-error"
                role="alert"
                className="text-sm text-destructive-foreground"
              >
                {t("tasks:milestones.invalidDateRange")}
              </p>
            )}
            {!milestone && (
              <MilestoneTaskPicker
                projectId={projectId}
                featureId={featureId}
                value={taskIds}
                onChange={setTaskIds}
                disabled={pending}
                onUnavailableChange={setHasUnavailableTasks}
              />
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {t(
                  error === "selection"
                    ? "tasks:milestones.taskSelectionChanged"
                    : "tasks:milestones.saveError",
                )}
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
              {t("tasks:milestones.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
