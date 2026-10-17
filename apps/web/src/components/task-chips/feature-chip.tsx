import { Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type Task from "@/types/task";
import { stopCardEvents } from "./stop-card-events";
import { taskChipClass } from "./task-chip-class";

type FeatureChipProps = {
  // Undefined while the feature isn't loaded, or once it's gone.
  feature: Pick<Task, "id" | "title"> | undefined;
  onOpen: (featureId: string) => void;
  className?: string;
};

export function FeatureChip({ feature, onOpen, className }: FeatureChipProps) {
  const { t } = useTranslation();
  if (!feature) return null;

  const label = t("tasks:features.chipLabel", { title: feature.title });

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(taskChipClass, "max-w-40", className)}
      {...stopCardEvents}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(feature.id);
      }}
    >
      <Layers aria-hidden="true" className="text-chip-icon" />
      <span className="truncate">{feature.title}</span>
    </button>
  );
}
