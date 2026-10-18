import { Rocket } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useGetReleases } from "@/hooks/queries/release/use-get-releases";
import { useFeatureIndex } from "@/hooks/queries/task/use-feature-index";
import { chipClass } from "./chip-class";
import type { FeatureChoice } from "./feature-picker-options";
import {
  featureReleaseOf,
  type ReleaseChoice,
  shownRelease,
} from "./release-choice";
import { ReleasePickerMenu } from "./release-picker-menu";

type ReleasePickerChipProps = {
  // "" until a project is chosen.
  projectId: string;
  value: ReleaseChoice;
  // The chosen feature, whose release the task follows unless one is picked.
  feature: FeatureChoice | null;
  onChange: (choice: ReleaseChoice) => void;
  disabled?: boolean;
};

export function ReleasePickerChip({
  projectId,
  value,
  feature,
  onChange,
  disabled,
}: ReleasePickerChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const featureIndex = useFeatureIndex(projectId || undefined);
  const featureReleaseId = featureReleaseOf(feature, featureIndex);
  const shown = shownRelease(value, featureReleaseId);
  // The list is read only to name a release the task will be in.
  const { data: releases, isError } = useGetReleases(projectId, {
    enabled: shown.id !== null,
  });
  const name =
    shown.id === null
      ? null
      : (releases?.find(({ id }) => id === shown.id)?.name ??
        (releases || isError ? t("tasks:releases.unknown") : null));
  const label =
    value.kind === "set" && value.id === null
      ? t("common:modals.createTask.noRelease")
      : name !== null && shown.fromFeature
        ? t("common:modals.createTask.releaseFromFeature", { name })
        : name;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={chipClass(name !== null)}
          disabled={disabled}
        >
          <Rocket aria-hidden="true" className="size-3.5" />
          {label === null ? (
            <span>{t("common:modals.createTask.release")}</span>
          ) : (
            <>
              <span className="sr-only">
                {t("common:modals.createTask.release")}
              </span>{" "}
              <span className="max-w-48 truncate">{label}</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {/* The popup mounts on open, so the search starts empty each time. */}
        {projectId ? (
          <ReleasePickerMenu
            projectId={projectId}
            selectedId={shown.id}
            featureReleaseId={featureReleaseId}
            onSelect={(id) => {
              onChange({ kind: "set", id });
              setOpen(false);
            }}
          />
        ) : (
          <PopoverDescription className="px-3 py-3 text-xs">
            {t("common:modals.createTask.chooseProjectForRelease")}
          </PopoverDescription>
        )}
      </PopoverContent>
    </Popover>
  );
}
