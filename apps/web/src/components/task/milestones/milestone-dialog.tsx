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
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { MilestoneDraftTasks } from "./milestone-draft-tasks";
import {
  MAX_MILESTONE_DRAFT_TASKS,
  type MilestoneDraftTask,
} from "./milestone-draft-task";

export function MilestoneDialog({
  projectId,
  featureId,
  milestone,
  initialReleaseId,
  onClose,
}: {
  projectId: string;
  featureId: string;
  milestone?: Milestone;
  initialReleaseId?: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(milestone?.title ?? "");
  const { data: workspace } = useActiveWorkspace();
  const { canCreateTasks } = useWorkspacePermission();
  const [planning, setPlanning] = useState<MilestoneInput>({
    leadId: milestone?.leadId ?? null,
    priority: milestone?.priority ?? "no-priority",
    releaseId: milestone ? milestone.releaseId : (initialReleaseId ?? null),
  });
  const [error, setError] = useState<{
    kind: "save" | "selection";
    detail?: string;
  } | null>(null);
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const [newTasks, setNewTasks] = useState<MilestoneDraftTask[]>([]);
  const [hasUnavailableTasks, setHasUnavailableTasks] = useState(false);
  const mutations = useMilestoneMutations(projectId, featureId);
  const pending = mutations.create.isPending || mutations.update.isPending;
  const valid =
    title.trim().length > 0 &&
    title.trim().length <= 255 &&
    !hasUnavailableTasks &&
    newTasks.length <= MAX_MILESTONE_DRAFT_TASKS &&
    (newTasks.length === 0 || canCreateTasks()) &&
    newTasks.every((task) => task.title.trim().length > 0);
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
                  ...(newTasks.length
                    ? {
                        newTasks: newTasks.map(({ title, type }) => ({
                          title: title.trim(),
                          type,
                        })),
                      }
                    : {}),
                });
              onClose();
            } catch (error) {
              setError({
                kind:
                  !milestone &&
                  taskIds.length > 0 &&
                  error instanceof HttpError &&
                  error.status === 409
                    ? "selection"
                    : "save",
                detail:
                  newTasks.length > 0 &&
                  error instanceof HttpError &&
                  error.status === 400
                    ? error.message
                    : undefined,
              });
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
                type="text"
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
                status: milestone?.status ?? "to-do",
                priority: planning.priority ?? "no-priority",
                releaseId: planning.releaseId ?? null,
                startDate: milestone?.startDate ?? null,
                endDate: milestone?.endDate ?? null,
              }}
              pending={pending}
              creating={!milestone}
              onChange={(value) =>
                setPlanning((current) => ({ ...current, ...value }))
              }
            />
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
            {!milestone && canCreateTasks() && (
              <MilestoneDraftTasks
                value={newTasks}
                onChange={setNewTasks}
                disabled={pending}
              />
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {t(
                  error.kind === "selection"
                    ? "tasks:milestones.taskSelectionChanged"
                    : "tasks:milestones.saveError",
                )}
                {error.detail && (
                  <span className="mt-1 block">{error.detail}</span>
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
