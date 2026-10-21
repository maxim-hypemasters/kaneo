import { useNavigate } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUpdateTaskFeature } from "@/hooks/mutations/task/use-update-task-feature";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import { useProjectSlugs } from "../sections/use-project-slugs";
import { RemoveFromFeatureButton } from "./remove-from-feature-button";
import { useTaskFeature } from "./use-task-feature";
import { taskReleaseSearch } from "../task-release-origin";
import { useTaskReleaseOrigin } from "../task-release-origin-context";

type FeatureBreadcrumbProps = {
  task: Pick<Task, "id" | "projectId" | "featureId">;
  workspaceId: string;
};

export function FeatureBreadcrumb({
  task,
  workspaceId,
}: FeatureBreadcrumbProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const origin = useTaskReleaseOrigin();
  const feature = useTaskFeature(task);
  const displayIdOf = useProjectSlugs(workspaceId);
  const { canUpdateTasks } = useWorkspacePermission();
  const { mutateAsync: updateFeature, isPending } = useUpdateTaskFeature();

  if (!feature) return null;

  const title = feature.title ?? t("tasks:features.unknown");
  const displayId = displayIdOf(feature.projectId, feature.number);
  const label = [displayId, title].filter(Boolean).join(" ");

  const removeFromFeature = async () => {
    try {
      await updateFeature({ task, featureId: null });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:features.updateError"),
      );
    }
  };

  return (
    <div className="flex w-fit min-w-0 max-w-full items-center gap-1 text-muted-foreground text-xs">
      <button
        type="button"
        aria-label={t("tasks:features.openFeature", { title: label })}
        disabled={feature.title === null}
        className="flex min-w-0 items-center gap-1.5 rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:hover:text-muted-foreground"
        onClick={() =>
          navigate({
            to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
            params: {
              workspaceId,
              projectId: feature.projectId,
              taskId: feature.id,
            },
            search: taskReleaseSearch(origin, feature.projectId),
          })
        }
      >
        <Layers aria-hidden="true" className="size-3 shrink-0" />
        <span className="shrink-0">{t("tasks:detail.subtaskOf")}</span>
        {displayId && <span className="shrink-0 font-mono">{displayId}</span>}
        <span className="truncate font-medium text-foreground/80">{title}</span>
      </button>
      {canUpdateTasks() && (
        <RemoveFromFeatureButton
          disabled={isPending}
          onClick={() => void removeFromFeature()}
        />
      )}
    </div>
  );
}
