import { Layers, Square } from "lucide-react";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import { useUpdateTaskType } from "@/hooks/mutations/task/use-update-task-type";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { HttpError } from "@/lib/http-error";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type TaskTypeMenuProps = {
  task: Pick<Task, "id" | "projectId" | "featureId" | "type">;
  // A feature with tasks can't become a task until they leave it.
  hasTasks: boolean;
  children: ReactNode;
};

export function TaskTypeMenu({ task, hasTasks, children }: TaskTypeMenuProps) {
  const { t } = useTranslation();
  const hintId = useId();
  const { mutateAsync: updateType, isPending } = useUpdateTaskType();
  const { canUpdateTasks } = useWorkspacePermission();

  if (!canUpdateTasks()) return <>{children}</>;

  const isFeature = task.type === "feature";
  const blocked = isFeature && hasTasks;

  const convert = async () => {
    const type = isFeature ? "task" : "feature";
    try {
      await updateType({ task, type });
    } catch (error) {
      // The feature gained tasks since this view last heard of them.
      if (
        type === "task" &&
        error instanceof HttpError &&
        error.status === 409
      ) {
        toast.error(t("tasks:features.convertBlocked"));
        return;
      }
      toast.error(
        error instanceof Error ? error.message : t("tasks:features.typeError"),
      );
    }
  };

  return (
    <Menu>
      <MenuTrigger asChild>{children}</MenuTrigger>
      <MenuPopup align="start" className="w-64">
        <MenuItem
          disabled={blocked || isPending}
          aria-describedby={blocked ? hintId : undefined}
          onClick={() => void convert()}
        >
          {isFeature ? <Square /> : <Layers />}
          {isFeature
            ? t("tasks:features.convertToTask")
            : t("tasks:features.convertToFeature")}
        </MenuItem>
        {blocked && (
          <p
            id={hintId}
            className="px-2 pt-0.5 pb-1.5 text-muted-foreground text-xs"
          >
            {t("tasks:features.convertBlocked")}
          </p>
        )}
      </MenuPopup>
    </Menu>
  );
}
