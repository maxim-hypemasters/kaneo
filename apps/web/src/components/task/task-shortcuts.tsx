import { useNavigate } from "@tanstack/react-router";
import { UserRoundIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { useUpdateTaskAssignee } from "@/hooks/mutations/task/use-update-task-assignee";
import { useUpdateTaskDueDate } from "@/hooks/mutations/task/use-update-task-due-date";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { useShortcut } from "@/lib/shortcuts/use-shortcut";
import { toast } from "@/lib/toast";
import { useFeatureTasks } from "./features/use-feature-tasks";
import { useTaskFeature } from "./features/use-task-feature";
import { useTaskCopyActions } from "./header/use-task-copy-actions";
import {
  clickTaskAction,
  findTaskAction,
  focusTaskAction,
} from "./task-action-target";
import { useRelationPickerStore } from "./task-relation-picker-store";
import { taskReleaseSearch } from "./task-release-origin";
import { useTaskReleaseOrigin } from "./task-release-origin-context";

type TaskShortcutsProps = {
  taskId: string;
  projectId: string;
  workspaceId: string;
  enabled?: boolean;
};

export function TaskShortcuts({
  taskId,
  projectId,
  workspaceId,
  enabled = true,
}: TaskShortcutsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const origin = useTaskReleaseOrigin();
  const { user } = useAuth();
  const { data: task } = useGetTask(taskId);
  const copyActions = useTaskCopyActions({ taskId, projectId, workspaceId });
  const isFeature = task?.type === "feature";
  const feature = useTaskFeature(task);
  const { tasks: featureTasks } = useFeatureTasks(
    isFeature ? taskId : "",
    task?.projectId ?? projectId,
  );
  const { mutateAsync: updateAssignee } = useUpdateTaskAssignee();
  const { mutateAsync: updateDueDate } = useUpdateTaskDueDate();
  const openRelationPicker = useRelationPickerStore((state) => state.open);
  const { canUpdateTasks, canAssignTasks } = useWorkspacePermission();
  const active = { enabled: enabled && Boolean(task) };
  const editable = { enabled: active.enabled && canUpdateTasks() };
  const assignable = {
    enabled: active.enabled && !isFeature && canAssignTasks(),
  };
  const planning = { enabled: editable.enabled && !isFeature };

  const openTask = (target: { id: string; projectId: string } | undefined) => {
    if (!target) return;
    navigate({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
      params: { workspaceId, projectId: target.projectId, taskId: target.id },
      search: taskReleaseSearch(origin, target.projectId),
    });
  };

  useShortcut("changeStatus", () => clickTaskAction("status"), planning);
  useShortcut("changePriority", () => clickTaskAction("priority"), planning);
  useShortcut("assignTask", () => clickTaskAction("assignee"), assignable);
  useShortcut("changeLabels", () => clickTaskAction("labels"), editable);
  useShortcut("setDueDate", () => clickTaskAction("dueDate"), planning);
  useShortcut("moveToProject", () => clickTaskAction("move"), editable);
  useShortcut("addLink", () => clickTaskAction("addLink"), editable);
  useShortcut("createSubtask", () => clickTaskAction("addSubtask"), {
    enabled: editable.enabled && isFeature,
  });
  useShortcut("toggleResources", () => clickTaskAction("resources"), active);
  useShortcut("renameTask", () => focusTaskAction("title"), editable);
  useShortcut(
    "editDescription",
    () => focusTaskAction("description"),
    editable,
  );
  useShortcut("commentOnTask", () => focusTaskAction("comment"), active);

  useShortcut(
    "assignToMe",
    async () => {
      if (!task || !user) return;
      try {
        await updateAssignee({ ...task, userId: user.id });
        toast.message(t("tasks:shortcuts.assignedToMe"), {
          icon: UserRoundIcon,
        });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("tasks:popover.assignee.updateError"),
        );
      }
    },
    assignable,
  );

  useShortcut(
    "removeDueDate",
    async () => {
      if (!task?.dueDate) return;
      try {
        await updateDueDate({ ...task, dueDate: null });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("tasks:popover.dueDate.updateError"),
        );
      }
    },
    editable,
  );

  useShortcut(
    "markBlockedBy",
    () => openRelationPicker(taskId, "blockedBy"),
    editable,
  );
  useShortcut(
    "markBlocking",
    () => openRelationPicker(taskId, "blocks"),
    editable,
  );
  useShortcut(
    "markRelated",
    () => openRelationPicker(taskId, "related"),
    editable,
  );
  // The Feature property where it's on screen, else the relation picker.
  useShortcut(
    "setParent",
    () => {
      if (findTaskAction("feature")) clickTaskAction("feature");
      else openRelationPicker(taskId, "feature");
    },
    { enabled: editable.enabled && !isFeature },
  );
  useShortcut("setRelease", () => clickTaskAction("release"), planning);
  useShortcut(
    "openParent",
    () =>
      openTask(feature?.title === null ? undefined : (feature ?? undefined)),
    { enabled: active.enabled && Boolean(task?.featureId) },
  );
  useShortcut("openSubtask", () => openTask(featureTasks[0]?.task), {
    enabled: active.enabled && isFeature,
  });

  useShortcut("copyTaskId", copyActions.copyId, active);
  useShortcut("copyTaskTitle", copyActions.copyTitle, active);
  useShortcut("copyAsMarkdown", copyActions.copyMarkdown, active);
  useShortcut("copyTaskUrl", copyActions.copyLink, active);
  useShortcut("copyBranchName", copyActions.copyBranch, active);

  return null;
}
