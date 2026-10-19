import { Bug, Layers, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TASK_TYPE_LABELS } from "@/lib/task-type";
import type { TaskType } from "@/types/task";

type TaskTypeGlyphProps = {
  type: TaskType | undefined;
  className?: string;
  decorative?: boolean;
};

export function TaskTypeGlyph({
  type = "task",
  className,
  decorative = false,
}: TaskTypeGlyphProps) {
  const { t } = useTranslation();
  const Icon = type === "feature" ? Layers : type === "bug" ? Bug : Square;
  return (
    <Icon
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : t(TASK_TYPE_LABELS[type])}
    />
  );
}
