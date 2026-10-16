import { Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { taskChipClass } from "./task-chip-class";

// Marks a feature's card or row; not interactive, so it keeps the card's cursor.
export function FeatureBadge({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <span
      className={cn(
        taskChipClass,
        "cursor-[inherit] font-medium hover:border-chip-border hover:bg-transparent",
        className,
      )}
    >
      <Layers aria-hidden="true" className="text-chip-icon" />
      {t("tasks:features.badge")}
    </span>
  );
}
