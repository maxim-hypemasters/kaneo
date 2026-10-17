import { Layers } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from "@/components/ui/popover";
import { chipClass } from "./chip-class";
import { FeaturePickerMenu } from "./feature-picker-menu";
import type { FeatureChoice } from "./feature-picker-options";

type FeaturePickerChipProps = {
  // "" until a project is chosen.
  projectId: string;
  projectSlug: string | undefined;
  value: FeatureChoice | null;
  onChange: (choice: FeatureChoice | null) => void;
  disabled?: boolean;
};

export function FeaturePickerChip({
  projectId,
  projectSlug,
  value,
  onChange,
  disabled,
}: FeaturePickerChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={chipClass(value !== null)}
          disabled={disabled}
        >
          <Layers aria-hidden="true" className="size-3.5" />
          {value === null ? (
            <span>{t("common:modals.createTask.feature")}</span>
          ) : (
            <>
              <span className="sr-only">
                {t("common:modals.createTask.feature")}
              </span>{" "}
              <span className="max-w-48 truncate">
                {value.kind === "new"
                  ? t("common:modals.createTask.newFeatureSuffix", {
                      name: value.title,
                    })
                  : value.title}
              </span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {/* The popup mounts on open, so the search starts empty each time and
            the features are fetched fresh. */}
        {projectId ? (
          <FeaturePickerMenu
            projectId={projectId}
            projectSlug={projectSlug}
            value={value}
            onSelect={(choice) => {
              onChange(choice);
              setOpen(false);
            }}
          />
        ) : (
          <PopoverDescription className="px-3 py-3 text-xs">
            {t("common:modals.createTask.chooseProjectForFeature")}
          </PopoverDescription>
        )}
      </PopoverContent>
    </Popover>
  );
}
