import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTaskFeature } from "@/hooks/mutations/task/use-update-task-feature";
import { useGetProjectFeatures } from "@/hooks/queries/task/use-get-project-features";
import { useFeatureIndex } from "@/hooks/queries/task/use-feature-index";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import { featureMenuOptions } from "../menus/feature-menu-options";
import { useProjectSlugs } from "../sections/use-project-slugs";
import { type FeatureSummary, pickableFeatures } from "./feature-lookup";

type TaskFeaturePopoverProps = {
  task: Pick<Task, "id" | "projectId" | "featureId">;
  // The task's current feature, as useTaskFeature resolves it.
  feature: FeatureSummary | null | undefined;
  workspaceId: string;
  children: ReactNode;
};

export function TaskFeaturePopover({
  task,
  feature,
  workspaceId,
  children,
}: TaskFeaturePopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // The project's features come from its cached board; without one, only
  // the current feature is offered next to "No feature".
  const index = useFeatureIndex(task.projectId);
  const {
    isPending: featuresPending,
    isError: featuresError,
    refetch,
  } = useGetProjectFeatures(task.projectId);
  const displayIdOf = useProjectSlugs(workspaceId);
  const { mutateAsync: updateFeature } = useUpdateTaskFeature();
  const { canUpdateTasks } = useWorkspacePermission();

  if (!canUpdateTasks()) return <>{children}</>;

  const features: FeatureSummary[] = pickableFeatures(index, [task.id]);
  if (feature && !features.some(({ id }) => id === feature.id)) {
    features.unshift(feature);
  }
  const currentFeatureId = task.featureId ?? null;
  // Until the board is cached, an empty list only means it is still loading.
  const status =
    features.length > 0 || currentFeatureId
      ? undefined
      : featuresPending
        ? t("common:empty.loading")
        : featuresError
          ? t("common:error.title")
          : t("tasks:features.empty");

  const changeFeature = async (value: string) => {
    setOpen(false);
    const featureId = value || null;
    if (featureId === currentFeatureId) return;
    try {
      await updateFeature({ task, featureId });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:features.updateError"),
      );
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <OptionMenu
          label={t("tasks:features.property")}
          placeholder={t("tasks:features.searchPlaceholder")}
          options={featureMenuOptions(
            features.map((option) => ({
              id: option.id,
              title: option.title,
              displayId: displayIdOf(option.projectId, option.number),
            })),
            currentFeatureId,
            {
              none: t("tasks:features.none"),
              unknown: t("tasks:features.unknown"),
            },
          )}
          onSelect={(value) => void changeFeature(value)}
          status={status}
        />
        {featuresError && (
          <button
            type="button"
            className="px-3 py-2 text-sm"
            onClick={() => void refetch()}
          >
            {t("common:error.tryAgain")}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
