import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import { Button } from "@/components/ui/button";
import { useGetReleases } from "@/hooks/queries/release/use-get-releases";
import { useFeatureIndex } from "@/hooks/queries/task/use-feature-index";
import { formatReleaseRange } from "@/lib/releases/release-date";
import { useReleaseToday } from "@/lib/releases/use-release-today";
import type Task from "@/types/task";
import { releaseMenuOptions } from "../menus/release-menu-options";

type TaskReleaseMenuProps = {
  task: Pick<Task, "projectId" | "type" | "featureId" | "releaseId">;
  // The picked release id, or null for no release.
  onSelect: (releaseId: string | null) => void;
};

// Mounted while the popover is open, so the project's releases are only
// fetched for someone about to pick one.
export function TaskReleaseMenu({ task, onSelect }: TaskReleaseMenuProps) {
  const { t } = useTranslation();
  const today = useReleaseToday();
  const {
    data: releases,
    isPending,
    isError,
    refetch,
  } = useGetReleases(task.projectId);
  const featureIndex = useFeatureIndex(task.projectId);
  const featureReleaseId = task.featureId
    ? (featureIndex.features.get(task.featureId)?.releaseId ?? null)
    : null;
  const current = task.releaseId ?? null;
  const options = releaseMenuOptions(releases ?? [], current, {
    today,
    featureReleaseId,
    labels: {
      none: t("tasks:releases.none"),
      unknown: t("tasks:releases.unknown"),
      featureRelease: t("tasks:releases.featureReleaseHint"),
    },
    rangeOf: (release) =>
      formatReleaseRange(release.startDate, release.submissionDate, { today }),
  });
  // Failed to load, the menu can still take the task out of its release.
  const status = isPending
    ? t("common:empty.loading")
    : !isError && options.length === 1 && current === null
      ? t("tasks:releases.pickerEmpty")
      : undefined;

  return (
    <>
      <OptionMenu
        label={t("tasks:releases.property")}
        placeholder={t("tasks:releases.searchPlaceholder")}
        options={options}
        // Release names often start with a digit ("2.4").
        numberShortcuts={false}
        onSelect={(value) => onSelect(value || null)}
        status={status}
      />
      {isError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 border-border/80 border-t px-3 py-2 text-muted-foreground text-xs"
        >
          {t("tasks:releases.loadError")}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void refetch()}
          >
            {t("tasks:releases.retry")}
          </Button>
        </div>
      )}
      {task.type === "feature" && !isPending && (
        <p className="border-border/80 border-t px-3 py-2 text-muted-foreground text-xs">
          {t("tasks:releases.followNote")}
        </p>
      )}
    </>
  );
}
