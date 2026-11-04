import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import bulkOperation from "@/fetchers/task/bulk-operation";
import updateTaskAssignee from "@/fetchers/task/update-task-assignee";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import { invalidateReleaseLinks } from "@/lib/invalidate-release-links";
import type {
  ReleasePlanTask,
  ReleasePlanTaskInputPatch,
} from "@/types/release-plan";
import { ReleasePlanAssigneeInput } from "./release-plan-assignee-input";
import { ReleasePlanEstimateInput } from "./release-plan-estimate-input";
import { ReleasePlanPriorityInput } from "./release-plan-priority-input";

type InputChange =
  | { field: "assignee"; userId: string | null; name: string | null }
  | { field: "estimate"; seconds: number | null }
  | { field: "priority"; priority: string };

export function ReleasePlanTaskInputs({
  task,
  projectId,
  workspaceId,
  disabled,
  onSavingChange,
  onSaved,
}: {
  task: Pick<
    ReleasePlanTask,
    | "taskId"
    | "currentAssigneeId"
    | "currentAssigneeName"
    | "estimateSeconds"
    | "priority"
  >;
  projectId: string;
  workspaceId: string;
  disabled?: boolean;
  onSavingChange: (saving: boolean) => void;
  onSaved: (patch: ReleasePlanTaskInputPatch) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const { canUpdateTasks, canAssignTasks } = useWorkspacePermission();
  const [errors, setErrors] = useState<{
    assignee: string | null;
    estimate: string | null;
    priority: string | null;
  }>({ assignee: null, estimate: null, priority: null });
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const mutation = useMutation({
    mutationFn: async (change: InputChange) => {
      if (change.field === "assignee")
        await updateTaskAssignee(task.taskId, { userId: change.userId });
      else if (change.field === "estimate")
        await bulkOperation({
          taskIds: [task.taskId],
          operation: "updateEstimate",
          value: change.seconds === null ? null : String(change.seconds),
        });
      else
        await bulkOperation({
          taskIds: [task.taskId],
          operation: "updatePriority",
          value: change.priority,
        });
    },
  });
  const save = async (change: InputChange) => {
    if (
      saving.current ||
      disabled ||
      (change.field === "assignee" ? !canAssignTasks() : !canUpdateTasks())
    )
      return false;
    const unchanged =
      change.field === "assignee"
        ? change.userId === task.currentAssigneeId
        : change.field === "estimate"
          ? change.seconds === task.estimateSeconds
          : change.priority === (task.priority || "no-priority");
    setErrors((current) => ({ ...current, [change.field]: null }));
    if (unchanged) return true;
    saving.current = true;
    setPending(true);
    onSavingChange(true);
    try {
      await mutation.mutateAsync(change);
      invalidateReleaseLinks(client, projectId, [
        { id: task.taskId, featureId: null },
      ]);
      invalidateMyWork(client);
      void client.invalidateQueries({ queryKey: ["projects"] });
      void client.invalidateQueries({ queryKey: ["notifications"] });
      const patch: ReleasePlanTaskInputPatch =
        change.field === "assignee"
          ? {
              currentAssigneeId: change.userId,
              currentAssigneeName: change.name,
            }
          : change.field === "estimate"
            ? { estimateSeconds: change.seconds }
            : { priority: change.priority };
      await onSaved(patch);
      void client.invalidateQueries(
        { queryKey: ["project-schedule", projectId] },
        { cancelRefetch: false },
      );
      return true;
    } catch (failure) {
      const message =
        failure instanceof Error
          ? failure.message
          : t(
              change.field === "assignee"
                ? "tasks:popover.assignee.updateError"
                : change.field === "estimate"
                  ? "tasks:estimate.updateError"
                  : "tasks:popover.priority.updateError",
            );
      setErrors((current) => ({ ...current, [change.field]: message }));
      return false;
    } finally {
      saving.current = false;
      setPending(false);
      onSavingChange(false);
    }
  };
  return (
    <div
      className="flex min-w-0 flex-wrap items-start gap-2"
      aria-busy={pending}
    >
      <ReleasePlanAssigneeInput
        value={{
          userId: task.currentAssigneeId,
          name: task.currentAssigneeName,
        }}
        projectId={projectId}
        workspaceId={workspaceId}
        editable={canAssignTasks()}
        disabled={disabled}
        saving={pending}
        error={errors.assignee}
        onSave={(choice) => save({ field: "assignee", ...choice })}
      />
      <ReleasePlanEstimateInput
        value={task.estimateSeconds}
        editable={canUpdateTasks()}
        disabled={disabled}
        saving={pending}
        error={errors.estimate}
        onSave={(seconds) => save({ field: "estimate", seconds })}
      />
      <ReleasePlanPriorityInput
        value={task.priority}
        editable={canUpdateTasks()}
        disabled={disabled}
        saving={pending}
        error={errors.priority}
        onSave={(priority) => save({ field: "priority", priority })}
      />
    </div>
  );
}
