import { Rocket } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTaskRelease } from "@/hooks/mutations/task/use-update-task-release";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import { TaskReleaseMenu } from "./task-release-menu";

type TaskReleasePopoverProps = {
  task: Pick<Task, "id" | "projectId" | "type" | "featureId" | "releaseId">;
  children: ReactNode;
};

export function TaskReleasePopover({
  task,
  children,
}: TaskReleasePopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutateAsync: updateRelease } = useUpdateTaskRelease();
  const { canUpdateTasks } = useWorkspacePermission();

  if (!canUpdateTasks()) return <>{children}</>;

  const changeRelease = async (releaseId: string | null) => {
    setOpen(false);
    if (releaseId === (task.releaseId ?? null)) return;
    try {
      const { movedTaskIds } = await updateRelease({ task, releaseId });
      if (movedTaskIds.length > 0) {
        toast.success(
          t("tasks:releases.movedWithFeature", { count: movedTaskIds.length }),
          { icon: Rocket },
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:releases.updateError"),
      );
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <TaskReleaseMenu
          task={task}
          onSelect={(releaseId) => void changeRelease(releaseId)}
        />
      </PopoverContent>
    </Popover>
  );
}
