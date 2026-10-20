import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import { useUpdateTaskType } from "@/hooks/mutations/task/use-update-task-type";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { TASK_TYPE_CONVERSIONS } from "@/lib/task-type";

type TaskTypeMenuProps = {
  task: Pick<Task, "id" | "projectId" | "featureId" | "type">;
  hasTasks: boolean;
  children: ReactNode;
};
export function TaskTypeMenu({ task, children }: TaskTypeMenuProps) {
  const { t } = useTranslation();
  const { mutateAsync: updateType, isPending } = useUpdateTaskType();
  const { canUpdateTasks } = useWorkspacePermission();
  if (!canUpdateTasks() || task.type === "feature") return <>{children}</>;
  const type = task.type === "bug" ? "task" : "bug";
  return (
    <Menu>
      <MenuTrigger asChild>{children}</MenuTrigger>
      <MenuPopup align="start" className="w-56">
        <MenuItem
          disabled={isPending}
          onClick={async () => {
            try {
              await updateType({ task, type });
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : t("tasks:features.typeError"),
              );
            }
          }}
        >
          <TaskTypeGlyph type={type} decorative />
          {t(TASK_TYPE_CONVERSIONS[type])}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
